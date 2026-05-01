"""Exportes de inventario y ventas POS (JSON, Excel, PDF)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from io import BytesIO

from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from PIL import Image as PILImage
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Image as PdfImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .pdf_brand import BOUTIQUE_PDF_PAGE_SIZE, pdf_header_image_bytes
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from inventory.models import InventoryItem
from inventory.unit_hierarchy import hierarchy_label, split_stock_hierarchy
from pos.models import Sale
from branches.models import Branch

_REPORT_KINDS = frozenset({'json', 'pdf', 'xlsx'})


def _set_no_store(resp):
    resp['Cache-Control'] = 'no-store, private'
    return resp


def _add_logo_to_ws(ws, cell: str = 'A1', width_px: int = 180) -> None:
    """Inserta logo de marca en una hoja de Excel, si existe."""
    logo_buf = pdf_header_image_bytes()
    try:
        with PILImage.open(logo_buf) as pil_im:
            src_w, src_h = pil_im.size
            if src_w <= 0 or src_h <= 0:
                return
            new_h = max(24, int((src_h * width_px) / src_w))
            resized = pil_im.convert('RGB').resize((width_px, new_h))
            out = BytesIO()
            resized.save(out, format='PNG')
            out.seek(0)
    except Exception:
        return
    img = XLImage(out)
    ws.add_image(img, cell)


def _report_export_format(request) -> str:
    """
    Tipo de salida del reporte (json, xlsx, pdf).

    - Cabecera `X-Boutique-Report` tiene prioridad (no depende del query; algunos
      proxies o caches alteran query strings).
    - No usar query `format`: REST framework lo reserva.
    - Query: `out`, `tipo`, `export`.
    """
    hdr = (request.headers.get('X-Boutique-Report') or '').strip().lower()
    if hdr in _REPORT_KINDS:
        return hdr
    raw = (
        request.query_params.get('tipo')
        or request.query_params.get('export')
        or request.query_params.get('out')
        or 'json'
    )
    return raw.lower()


def _parse_branch(request) -> int | None:
    raw = request.query_params.get('branch')
    if raw is None or raw == '':
        return None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def _parse_inventory_scope(request) -> str | None:
    raw = (request.query_params.get('scope') or request.query_params.get('ubicacion') or '').strip().lower()
    return raw if raw in {'tienda', 'b1', 'b2', 'b3'} else None


def _bodega_branch_ids() -> dict[str, int | None]:
    by_name = {b.name.strip().lower(): int(b.id) for b in Branch.objects.filter(is_active=True)}
    return {
        'b1': by_name.get('bodega 1'),
        'b2': by_name.get('bodega 2'),
        'b3': by_name.get('bodega 3'),
    }


def _inventory_rows(branch_id: int | None, scope: str | None = None) -> list[dict]:
    qs = InventoryItem.objects.select_related('branch', 'category').order_by('branch__name', 'line', 'sku')
    if branch_id is not None:
        qs = qs.filter(branch_id=branch_id)
    elif scope is not None:
        bodega_ids_map = _bodega_branch_ids()
        bodega_ids = [bid for bid in bodega_ids_map.values() if isinstance(bid, int) and bid > 0]
        if scope == 'tienda':
            if bodega_ids:
                qs = qs.exclude(branch_id__in=bodega_ids)
        else:
            bid = bodega_ids_map.get(scope)
            if isinstance(bid, int) and bid > 0:
                qs = qs.filter(branch_id=bid)
            else:
                qs = qs.none()
    rows = []
    for obj in qs:
        upp = int(obj.units_per_package)
        ppf = int(obj.packages_per_fardo)
        units_per_fardo = upp * ppf
        rows.append(
            {
                'id': obj.pk,
                'nombre': obj.name,
                'branch_id': obj.branch_id,
                'branch_name': obj.branch.name if obj.branch_id else '',
                'categoria': obj.category.name if obj.category_id else '',
                'units_per_package': obj.units_per_package,
                'units_per_fardo': units_per_fardo,
                'cantidad': obj.quantity,
                'precio_unitario': str(obj.unit_price),
                'precio_costo': str(obj.cost_price),
            }
        )
    return rows


def _pos_sales_rows(branch_id: int | None, limit: int = 500) -> list[dict]:
    qs = Sale.objects.select_related('branch').prefetch_related('lines__inventory_item').order_by('-created_at')
    if branch_id is not None:
        qs = qs.filter(branch_id=branch_id)
    out = []
    for sale in qs[:limit]:
        lines = []
        for ln in sale.lines.all():
            item = ln.inventory_item
            f, p, u = split_stock_hierarchy(ln.quantity, item.units_per_package, item.packages_per_fardo)
            lines.append(
                {
                    'sku': item.sku,
                    'producto': item.name,
                    'cantidad': ln.quantity,
                    'units_per_package': item.units_per_package,
                    'packages_per_fardo': item.packages_per_fardo,
                    'venta_fardos': f,
                    'venta_paquetes': p,
                    'venta_unidades_resto': u,
                    'jerarquia_txt': hierarchy_label(f, p, u),
                    'precio_unitario': str(ln.unit_price),
                    'subtotal': str(Decimal(ln.unit_price) * ln.quantity),
                }
            )
        out.append(
            {
                'id': sale.pk,
                'ubicacion': sale.branch.name,
                'metodo_pago': sale.get_payment_method_display(),
                'total': str(sale.total),
                'fecha': sale.created_at.isoformat(),
                'lineas': lines,
            }
        )
    return out


def _branded_table_pdf(
    document_title: str,
    report_heading: str,
    headers: list[str],
    data_rows: list[list],
    filename: str,
) -> HttpResponse:
    """PDF en carta vertical con logo de empresa (o cabecera de respaldo) y tabla."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=BOUTIQUE_PDF_PAGE_SIZE,
        title=document_title,
        leftMargin=28,
        rightMargin=28,
        topMargin=34,
        bottomMargin=30,
    )
    styles = getSampleStyleSheet()
    title_left = ParagraphStyle('repTitleLeft', parent=styles['Title'], alignment=TA_LEFT)
    normal_left = ParagraphStyle('repNormalLeft', parent=styles['Normal'], alignment=TA_LEFT)
    story: list = []

    logo_buf = pdf_header_image_bytes()
    logo_buf.seek(0)
    with PILImage.open(logo_buf) as pil_im:
        lw, lh = pil_im.size
    logo_buf.seek(0)
    # Logo compacto, esquina superior izquierda (ancho máx. ~41 mm en puntos).
    logo_max_w = 112.0
    display_w = min(logo_max_w, float(lw)) if lw else logo_max_w
    display_h = display_w * (float(lh) / float(lw)) if lw else 32.0
    story.append(PdfImage(logo_buf, width=display_w, height=display_h, hAlign='LEFT'))
    story.append(Spacer(1, 8))

    story.append(Paragraph(f'<b>{report_heading}</b>', title_left))
    story.append(
        Paragraph(
            f'Generado: {timezone.now().strftime("%Y-%m-%d %H:%M")} — Aluminios Ixmucane',
            normal_left,
        )
    )
    story.append(Spacer(1, 12))

    table_data = [headers] + data_rows
    tbl = Table(table_data, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#c40000')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.25, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
            ]
        )
    )
    story.append(tbl)
    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    return _set_no_store(resp)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_report(request, salida: str | None = None):
    if salida is not None and str(salida).strip() != '':
        fmt = str(salida).strip().lower()
    else:
        fmt = _report_export_format(request)
    if fmt not in _REPORT_KINDS:
        return _set_no_store(
            JsonResponse(
                {
                    'detail': f'Formato no valido ({fmt}). Use /reports/inventario/json/, /pdf/, /xlsx/ o query out= (o tipo=).',
                },
                status=400,
            )
        )
    branch_id = _parse_branch(request)
    scope = _parse_inventory_scope(request)

    if fmt == 'json':
        return _set_no_store(
            JsonResponse({'generated_at': timezone.now().isoformat(), 'items': _inventory_rows(branch_id, scope)})
        )

    rows = _inventory_rows(branch_id, scope)
    headers = [
        'Nombre',
        'Categoría',
        'U/paquete',
        'U/fardo',
        'Unidades',
        'Precio costo',
        'Precio venta',
    ]

    if fmt == 'xlsx':
        wb = Workbook()
        ws = wb.active
        ws.title = 'Inventario'
        _add_logo_to_ws(ws, 'A1')
        header_row = 8
        bold = Font(bold=True)
        for col, h in enumerate(headers, start=1):
            c = ws.cell(row=header_row, column=col, value=h)
            c.font = bold
        for r, item in enumerate(rows, start=header_row + 1):
            ws.cell(row=r, column=1, value=item['nombre'])
            ws.cell(row=r, column=2, value=item['categoria'])
            ws.cell(row=r, column=3, value=item['units_per_package'])
            ws.cell(row=r, column=4, value=item['units_per_fardo'])
            ws.cell(row=r, column=5, value=item['cantidad'])
            ws.cell(row=r, column=6, value=item['precio_costo'])
            ws.cell(row=r, column=7, value=item['precio_unitario'])
        buf = BytesIO()
        wb.save(buf)
        data = buf.getvalue()
        buf.close()
        resp = HttpResponse(
            data,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        resp['Content-Disposition'] = f'attachment; filename="reporte_inventario_{datetime.now():%Y%m%d_%H%M}.xlsx"'
        return _set_no_store(resp)

    if fmt == 'pdf':
        data_rows = [
            [
                item['nombre'][:48],
                item['categoria'][:24],
                str(item['units_per_package']),
                str(item['units_per_fardo']),
                str(item['cantidad']),
                item['precio_costo'],
                item['precio_unitario'],
            ]
            for item in rows[:400]
        ]
        return _branded_table_pdf(
            'Inventario — Aluminios Ixmucane',
            'Reporte de inventario general',
            headers,
            data_rows,
            f'reporte_inventario_{datetime.now():%Y%m%d_%H%M}.pdf',
        )

    return _set_no_store(
        JsonResponse({'detail': 'Use /reports/inventario/json/, /pdf/, /xlsx/ o query out= (o tipo=).'}, status=400)
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pos_sales_report(request, salida: str | None = None):
    if salida is not None and str(salida).strip() != '':
        fmt = str(salida).strip().lower()
    else:
        fmt = _report_export_format(request)
    if fmt not in _REPORT_KINDS:
        return _set_no_store(
            JsonResponse(
                {
                    'detail': f'Formato no valido ({fmt}). Use /reports/sistema-pos/json/, /pdf/, /xlsx/ o query out= (o tipo=).',
                },
                status=400,
            )
        )
    branch_id = _parse_branch(request)

    if fmt == 'json':
        return _set_no_store(
            JsonResponse({'generated_at': timezone.now().isoformat(), 'ventas': _pos_sales_rows(branch_id)})
        )

    rows = _pos_sales_rows(branch_id)

    if fmt == 'xlsx':
        wb = Workbook()
        ws = wb.active
        ws.title = 'Ventas'
        _add_logo_to_ws(ws, 'A1')
        h = ['Ticket', 'Fecha', 'Ubicación', 'Pago', 'Total']
        header_row = 8
        bold = Font(bold=True)
        for col, title in enumerate(h, start=1):
            ws.cell(row=header_row, column=col, value=title).font = bold
        r = header_row + 1
        for v in rows:
            ws.cell(row=r, column=1, value=v['id'])
            ws.cell(row=r, column=2, value=v['fecha'][:19])
            ws.cell(row=r, column=3, value=v['ubicacion'])
            ws.cell(row=r, column=4, value=v['metodo_pago'])
            ws.cell(row=r, column=5, value=v['total'])
            r += 1
        ws2 = wb.create_sheet('Detalle líneas')
        _add_logo_to_ws(ws2, 'A1')
        h2 = ['Ticket', 'SKU', 'Producto', 'Cantidad (u)', 'Desglose', 'P.U.', 'Subtotal']
        header_row_2 = 8
        for col, title in enumerate(h2, start=1):
            ws2.cell(row=header_row_2, column=col, value=title).font = bold
        r2 = header_row_2 + 1
        for v in rows:
            for ln in v['lineas']:
                ws2.cell(row=r2, column=1, value=v['id'])
                ws2.cell(row=r2, column=2, value=ln['sku'])
                ws2.cell(row=r2, column=3, value=ln['producto'][:60])
                ws2.cell(row=r2, column=4, value=ln['cantidad'])
                ws2.cell(row=r2, column=5, value=ln['jerarquia_txt'])
                ws2.cell(row=r2, column=6, value=ln['precio_unitario'])
                ws2.cell(row=r2, column=7, value=ln['subtotal'])
                r2 += 1
        buf = BytesIO()
        wb.save(buf)
        data = buf.getvalue()
        buf.close()
        resp = HttpResponse(
            data,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        resp['Content-Disposition'] = f'attachment; filename="reporte_pos_{datetime.now():%Y%m%d_%H%M}.xlsx"'
        return _set_no_store(resp)

    if fmt == 'pdf':
        data_rows = []
        for v in rows[:200]:
            data_rows.append([str(v['id']), v['fecha'][:19], v['metodo_pago'], v['total']])
        return _branded_table_pdf(
            'Ventas POS — Aluminios Ixmucane',
            'Reporte de ventas POS (tickets)',
            ['Ticket', 'Fecha', 'Pago', 'Total'],
            data_rows,
            f'reporte_pos_{datetime.now():%Y%m%d_%H%M}.pdf',
        )

    return _set_no_store(
        JsonResponse({'detail': 'Use /reports/sistema-pos/json/, /pdf/, /xlsx/ o query out= (o tipo=).'}, status=400)
    )
