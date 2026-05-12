"""Generadores de PDF para ventas POS.

* `build_factura_pdf(sale)`        → factura tamaño carta con datos FEL
                                     (Serie, No. autorización, fecha de
                                     certificación, datos del emisor y
                                     receptor, frase legal según régimen).
* `build_factura_ticket_pdf(sale)` → ticket angosto (80mm) con la misma
                                     información compactada para impresoras
                                     térmicas.

Ambos funcionan con o sin certificación FEL (si no está certificada se omiten
los campos correspondientes y aparece el aviso "Pendiente de certificación FEL").
"""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO

from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image as PdfImage,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from PIL import Image as PILImage

from reports.pdf_brand import pdf_header_image_bytes

from .models import Sale


# ───────────────────────────── helpers ──────────────────────────────


_IVA_RATE = Decimal('0.12')


def _emisor_y_documento(sale: Sale):
    """Devuelve (emisor, fel_doc) leyendo del FelDocumento si existe."""
    fel = getattr(sale, 'fel', None)
    if fel is None:
        from fel.models import FelDocumento  # importar perezosamente
        fel = FelDocumento.objects.filter(sale=sale).select_related('emisor').first()
    emisor = fel.emisor if fel else None
    if emisor is None:
        from fel.models import FelEmisor
        emisor = FelEmisor.objects.filter(is_active=True, is_default=True).first()
        if emisor is None:
            emisor = FelEmisor.objects.filter(is_active=True).first()
    return emisor, fel


def _frase_regimen(emisor) -> str:
    """Frase legal obligatoria según régimen del emisor (Guatemala SAT)."""
    if emisor is None:
        return ''
    afil = (emisor.afiliacion_iva or '').upper()
    if afil == 'PEQ':
        return (
            'Sujeto a pagos trimestrales / No genera derecho a crédito fiscal · '
            'Pequeño Contribuyente'
        )
    if afil == 'EXE':
        return 'Sujeto a régimen de exención de IVA'
    return 'Documento tributario electrónico'


def _calcular_totales(sale: Sale, emisor) -> dict:
    """Subtotal sin IVA + IVA + total. Para PEQ/EXE el IVA es 0."""
    bruto = Decimal('0')
    for ln in sale.lines.all():
        bruto += Decimal(ln.unit_price or 0) * Decimal(ln.quantity or 0)
    descuento = Decimal(sale.discount or 0)
    total = max(Decimal('0'), bruto - descuento)
    afil = (getattr(emisor, 'afiliacion_iva', '') or '').upper()
    if afil in ('PEQ', 'EXE'):
        iva = Decimal('0')
        subtotal = total
    else:
        # En régimen general el precio ya incluye IVA; el IVA se calcula a partir
        # del total con IVA: IVA = total - total/1.12.
        subtotal = (total / (Decimal('1') + _IVA_RATE)).quantize(Decimal('0.01'))
        iva = (total - subtotal).quantize(Decimal('0.01'))
    return {
        'bruto': bruto.quantize(Decimal('0.01')),
        'descuento': descuento.quantize(Decimal('0.01')),
        'subtotal': subtotal,
        'iva': iva,
        'total': total.quantize(Decimal('0.01')),
    }


def _qr_drawing(text: str, size_mm: float) -> Drawing:
    code = qr.QrCodeWidget(text)
    bounds = code.getBounds()
    w = bounds[2] - bounds[0]
    h = bounds[3] - bounds[1]
    side = size_mm * mm
    d = Drawing(side, side, transform=[side / w, 0, 0, side / h, 0, 0])
    d.add(code)
    return d


def _logo_image(max_w: float) -> PdfImage | None:
    buf = pdf_header_image_bytes()
    if buf is None:
        return None
    buf.seek(0)
    try:
        with PILImage.open(buf) as pil_im:
            lw, lh = pil_im.size
    except Exception:
        return None
    buf.seek(0)
    if not lw or not lh:
        return None
    w = min(max_w, float(lw))
    h = w * (float(lh) / float(lw))
    return PdfImage(buf, width=w, height=h, hAlign='LEFT')


def _q(amount: Decimal) -> str:
    return f'Q {amount:,.2f}'


# ─────────────────────────── factura carta ──────────────────────────


def build_factura_pdf(sale: Sale) -> tuple[bytes, str]:
    """Devuelve (pdf_bytes, filename) de la factura tamaño carta."""
    emisor, fel = _emisor_y_documento(sale)
    totales = _calcular_totales(sale, emisor)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        title=f'Factura-{sale.pk}',
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )

    styles = getSampleStyleSheet()
    s_title = ParagraphStyle('facTitle', parent=styles['Heading2'], alignment=TA_LEFT, textColor=colors.HexColor('#1a1a2e'))
    s_h3 = ParagraphStyle('facH3', parent=styles['Heading3'], alignment=TA_LEFT)
    s_normal = ParagraphStyle('facNormal', parent=styles['Normal'], alignment=TA_LEFT, fontSize=9, leading=12)
    s_small = ParagraphStyle('facSmall', parent=styles['Normal'], alignment=TA_LEFT, fontSize=8, leading=10, textColor=colors.HexColor('#555'))
    s_right = ParagraphStyle('facRight', parent=s_normal, alignment=TA_RIGHT)
    s_total = ParagraphStyle('facTotal', parent=s_h3, alignment=TA_RIGHT, textColor=colors.HexColor('#c40000'))
    s_legal = ParagraphStyle('facLegal', parent=s_small, alignment=TA_CENTER)

    story: list = []

    logo = _logo_image(140)
    emisor_block = Paragraph(
        '<b>{nombre}</b><br/>'
        '{nombre_comercial}'
        '<br/>NIT: {nit}'
        '<br/>{direccion}'
        '<br/>{municipio}, {departamento}, {pais}'
        .format(
            nombre=(emisor.nombre if emisor else 'EMISOR NO CONFIGURADO'),
            nombre_comercial=(emisor.nombre_comercial or '') if emisor else '',
            nit=(emisor.nit if emisor else '—'),
            direccion=(emisor.direccion if emisor else '—'),
            municipio=(emisor.municipio if emisor else ''),
            departamento=(emisor.departamento if emisor else ''),
            pais=(emisor.pais if emisor else 'GT'),
        ),
        s_normal,
    )
    header_table = Table(
        [[logo or Paragraph('', s_normal), emisor_block]],
        colWidths=[150, None],
        hAlign='LEFT',
    )
    header_table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    story.append(header_table)
    story.append(Spacer(1, 8))

    if fel and fel.estado == 'certificado':
        title_txt = 'FACTURA ELECTRÓNICA (FEL)'
        ambiente_txt = (
            'AMBIENTE DE PRUEBAS · NO TIENE VALIDEZ FISCAL'
            if fel.ambiente == 'pruebas'
            else 'Ambiente de producción'
        )
    else:
        title_txt = 'FACTURA / TICKET DE VENTA'
        ambiente_txt = 'Pendiente de certificación FEL'

    story.append(Paragraph(f'<b>{title_txt}</b>', s_title))
    story.append(Paragraph(ambiente_txt, s_small))
    story.append(Spacer(1, 6))

    fel_data = [
        ['Serie', (fel.serie if fel else '—') or '—'],
        ['No. autorización', (fel.numero_autorizacion if fel else '—') or '—'],
        ['Fecha de emisión', sale.created_at.strftime('%d/%m/%Y %H:%M')],
        ['Fecha de certificación',
         (fel.fecha_certificacion.strftime('%d/%m/%Y %H:%M')
          if (fel and fel.fecha_certificacion) else '—')],
        ['No. interno', f'#{sale.pk}'],
        ['Forma de pago', sale.get_payment_method_display()],
    ]
    fel_table = Table(fel_data, colWidths=[110, 240], hAlign='LEFT')
    fel_table.setStyle(
        TableStyle(
            [
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#555')),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('LINEBELOW', (0, 0), (-1, -1), 0.25, colors.HexColor('#e5e7eb')),
            ]
        )
    )

    qr_drawing = None
    if fel and fel.numero_autorizacion:
        qr_drawing = _qr_drawing(fel.numero_autorizacion, 32)
    fel_qr_table = Table(
        [[fel_table, qr_drawing or Paragraph('', s_normal)]],
        colWidths=[None, 110],
        hAlign='LEFT',
    )
    fel_qr_table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    story.append(fel_qr_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph('<b>Receptor</b>', s_h3))
    story.append(
        Paragraph(
            'Nombre: {nombre}<br/>NIT: {nit}<br/>Dirección: {direccion}<br/>Tel.: {tel}'.format(
                nombre=(sale.customer_name or 'Consumidor final'),
                nit=(getattr(sale.customer, 'nit', '') or 'CF'),
                direccion=(sale.customer_address or 'Ciudad'),
                tel=(sale.customer_phone or '—'),
            ),
            s_normal,
        )
    )
    story.append(Spacer(1, 10))

    data = [['SKU', 'Descripción', 'Cant.', 'P. Unit.', 'Subtotal']]
    for ln in sale.lines.all():
        sub = Decimal(ln.unit_price or 0) * Decimal(ln.quantity or 0)
        data.append(
            [
                ln.inventory_item.sku,
                Paragraph(ln.inventory_item.name, s_small),
                str(ln.quantity),
                _q(Decimal(ln.unit_price or 0)),
                _q(sub),
            ]
        )
    tbl = Table(data, repeatRows=1, colWidths=[70, 250, 40, 70, 70])
    tbl.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a2e')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('ALIGN', (2, 1), (2, -1), 'CENTER'),
                ('ALIGN', (3, 1), (4, -1), 'RIGHT'),
                ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#e5e7eb')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
            ]
        )
    )
    story.append(tbl)
    story.append(Spacer(1, 10))

    tot_rows = []
    tot_rows.append(['Subtotal sin IVA', _q(totales['subtotal'])])
    if totales['descuento'] > 0:
        tot_rows.append(['Descuento', f"- {_q(totales['descuento'])}"])
    if totales['iva'] > 0:
        tot_rows.append(['IVA (12%)', _q(totales['iva'])])
    tot_rows.append(['TOTAL', _q(totales['total'])])
    tot_table = Table(tot_rows, colWidths=[120, 90], hAlign='RIGHT')
    tot_table.setStyle(
        TableStyle(
            [
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('LINEBELOW', (0, 0), (-1, -2), 0.25, colors.HexColor('#e5e7eb')),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#c40000')),
                ('TEXTCOLOR', (0, -1), (-1, -1), colors.whitesmoke),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, -1), (-1, -1), 11),
                ('TOPPADDING', (0, -1), (-1, -1), 6),
                ('BOTTOMPADDING', (0, -1), (-1, -1), 6),
            ]
        )
    )
    story.append(tot_table)
    story.append(Spacer(1, 16))

    if sale.payment_status and sale.payment_status != 'paid':
        if sale.payment_status == 'credit':
            txt = 'Venta a crédito'
            if sale.credit_days:
                txt += f' — plazo de {sale.credit_days} días'
        else:
            txt = 'Pago pendiente'
        story.append(Paragraph(f'<b>Condición:</b> {txt}', s_normal))
        if sale.credit_note:
            story.append(Paragraph(sale.credit_note, s_small))
        story.append(Spacer(1, 8))

    legal = _frase_regimen(emisor)
    if legal:
        story.append(Paragraph(legal, s_legal))
    story.append(
        Paragraph(
            'Aluminios Ixmucane · Conserve este documento para sus registros.',
            s_legal,
        )
    )

    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    filename = f'factura_{sale.pk}.pdf'
    return pdf, filename


# ───────────────────────────── ticket 80mm ──────────────────────────


def build_factura_ticket_pdf(sale: Sale) -> tuple[bytes, str]:
    """Ticket de 80mm de ancho (estilo impresora térmica)."""
    emisor, fel = _emisor_y_documento(sale)
    totales = _calcular_totales(sale, emisor)

    width = 80 * mm
    line_count = max(8, sale.lines.count())
    height = (90 + 7 * line_count) * mm

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=(width, height),
        title=f'Ticket-{sale.pk}',
        leftMargin=4 * mm,
        rightMargin=4 * mm,
        topMargin=4 * mm,
        bottomMargin=4 * mm,
    )

    styles = getSampleStyleSheet()
    sc = ParagraphStyle('tkCenter', parent=styles['Normal'], alignment=TA_CENTER, fontSize=8.2, leading=10)
    sc_b = ParagraphStyle('tkCenterB', parent=sc, fontName='Helvetica-Bold', fontSize=9.6, leading=12)
    sl = ParagraphStyle('tkLeft', parent=styles['Normal'], alignment=TA_LEFT, fontSize=7.5, leading=9)
    sl_b = ParagraphStyle('tkLeftB', parent=sl, fontName='Helvetica-Bold')
    sr_b = ParagraphStyle('tkRightB', parent=sl_b, alignment=TA_RIGHT, fontSize=8.5, textColor=colors.HexColor('#c40000'))

    story: list = []
    if emisor is not None:
        story.append(Paragraph(emisor.nombre, sc_b))
        if emisor.nombre_comercial and emisor.nombre_comercial != emisor.nombre:
            story.append(Paragraph(emisor.nombre_comercial, sc))
        story.append(Paragraph(f'NIT: {emisor.nit}', sc))
        story.append(Paragraph(emisor.direccion or '', sc))
        story.append(Paragraph(
            f'{emisor.municipio or ""}, {emisor.departamento or ""}'.strip(', '),
            sc,
        ))

    if fel and fel.estado == 'certificado':
        story.append(Spacer(1, 4))
        story.append(Paragraph('FACTURA ELECTRÓNICA (FEL)', sc_b))
        if fel.ambiente == 'pruebas':
            story.append(Paragraph('— PRUEBAS / SIN VALIDEZ FISCAL —', sc))
    else:
        story.append(Spacer(1, 4))
        story.append(Paragraph('TICKET DE VENTA', sc_b))
        story.append(Paragraph('Pendiente certificación FEL', sc))

    story.append(Spacer(1, 4))
    story.append(Paragraph('—' * 38, sc))

    info_rows = [
        ['Ticket', f'#{sale.pk}'],
        ['Fecha', sale.created_at.strftime('%d/%m/%Y %H:%M')],
    ]
    if fel and fel.estado == 'certificado':
        info_rows.append(['Serie', fel.serie or '—'])
        info_rows.append(['No. Aut.', (fel.numero_autorizacion or '—')[:24]])
        if fel.fecha_certificacion:
            info_rows.append(['Cert.', fel.fecha_certificacion.strftime('%d/%m/%Y %H:%M')])
    info_rows.append(['Pago', sale.get_payment_method_display()])
    info_rows.append(['Cliente', (sale.customer_name or 'Consumidor final')[:24]])
    nit_cli = (getattr(sale.customer, 'nit', '') or 'CF')
    info_rows.append(['NIT', nit_cli])
    info_table = Table(info_rows, colWidths=[18 * mm, 50 * mm])
    info_table.setStyle(
        TableStyle(
            [
                ('FONTSIZE', (0, 0), (-1, -1), 7.5),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 4))
    story.append(Paragraph('—' * 38, sc))

    body_rows: list = [['Producto', 'Cant', 'Total']]
    for ln in sale.lines.all():
        sub = Decimal(ln.unit_price or 0) * Decimal(ln.quantity or 0)
        body_rows.append([
            Paragraph(ln.inventory_item.name[:32], sl),
            str(ln.quantity),
            _q(sub),
        ])
    body_table = Table(body_rows, colWidths=[42 * mm, 10 * mm, 18 * mm])
    body_table.setStyle(
        TableStyle(
            [
                ('FONTSIZE', (0, 0), (-1, -1), 7.5),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('ALIGN', (1, 1), (1, -1), 'CENTER'),
                ('ALIGN', (2, 1), (2, -1), 'RIGHT'),
                ('LINEBELOW', (0, 0), (-1, 0), 0.25, colors.black),
                ('TOPPADDING', (0, 0), (-1, -1), 1),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            ]
        )
    )
    story.append(body_table)
    story.append(Spacer(1, 4))
    story.append(Paragraph('—' * 38, sc))

    tot_rows: list = []
    tot_rows.append(['Subtotal', _q(totales['subtotal'])])
    if totales['descuento'] > 0:
        tot_rows.append(['Descuento', f"- {_q(totales['descuento'])}"])
    if totales['iva'] > 0:
        tot_rows.append(['IVA 12%', _q(totales['iva'])])
    tot_rows.append(['TOTAL', _q(totales['total'])])
    tot_table = Table(tot_rows, colWidths=[40 * mm, 30 * mm], hAlign='RIGHT')
    tot_table.setStyle(
        TableStyle(
            [
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#c40000')),
                ('FONTSIZE', (0, -1), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(tot_table)
    story.append(Spacer(1, 6))

    if fel and fel.numero_autorizacion:
        qr_d = _qr_drawing(fel.numero_autorizacion, 24)
        story.append(KeepTogether([qr_d, Paragraph(fel.numero_autorizacion, sc)]))
        story.append(Spacer(1, 4))

    legal = _frase_regimen(emisor)
    if legal:
        story.append(Paragraph(legal, sc))
    story.append(Paragraph('Gracias por su preferencia', sc_b))

    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    filename = f'ticket_{sale.pk}.pdf'
    return pdf, filename
