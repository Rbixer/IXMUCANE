"""Generación de códigos de barra (Code128) y etiquetas imprimibles.

Usa exclusivamente componentes de ReportLab para evitar dependencias extra.

- `barcode_png_response`: PNG del código de barras de un producto.
- `etiqueta_pdf_response`: PDF con N copias de la etiqueta de un producto
  (nombre, SKU, precio, código).
- `etiquetas_lote_pdf_response`: PDF con etiquetas de varios productos en
  rejilla 2 columnas × 5 filas en página carta (10 etiquetas por hoja).

Las etiquetas son aprox. 90 × 50 mm: ideales para impresoras térmicas o
papel de etiquetas adhesivas estándar (Avery 5160 o similar).
"""

from __future__ import annotations

from io import BytesIO
from typing import Iterable

import barcode as _pybarcode
from barcode.writer import ImageWriter as _BarcodeImageWriter
from django.http import HttpResponse
from reportlab.graphics.barcode import createBarcodeDrawing
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Table,
    TableStyle,
)

from .models import InventoryItem


# ── Helpers ──────────────────────────────────────────────────────────────


def _barcode_value(item: InventoryItem) -> str:
    """Valor a codificar. Prioriza SKU; si está vacío usa identificador estable."""
    sku = (item.sku or '').strip()
    if sku:
        return sku
    return f'IXM-{item.pk:06d}'


def _build_code128(value: str, width_mm: float = 60.0, height_mm: float = 18.0) -> Drawing:
    """Drawing reutilizable de Code128 con el ancho/alto en mm dados."""
    bar_height = height_mm * mm
    drawing = createBarcodeDrawing(
        'Code128',
        value=value,
        barHeight=bar_height,
        humanReadable=False,
        quiet=True,
    )
    bw = drawing.width or 1.0
    target_w = width_mm * mm
    drawing.scale(target_w / bw, 1.0)
    drawing.width = target_w
    drawing.height = bar_height
    return drawing


def _fmt_q(price) -> str:
    try:
        return f'Q {float(price):,.2f}'
    except Exception:
        return f'Q {price}'


# ── PNG de código de barras ──────────────────────────────────────────────


def barcode_png_response(item: InventoryItem) -> HttpResponse:
    """PNG del Code128 del producto. Usa python-barcode (Pillow) para evitar
    dependencias de renderPM (rlPyCairo / _rl_renderPM)."""
    value = _barcode_value(item)
    Code128 = _pybarcode.get_barcode_class('code128')
    writer = _BarcodeImageWriter()
    options = {
        'module_height': 18.0,
        'module_width': 0.32,
        'font_size': 10,
        'text_distance': 4.0,
        'quiet_zone': 4.0,
        'write_text': True,
        'background': 'white',
        'foreground': 'black',
        'dpi': 300,
    }
    bc = Code128(value, writer=writer)
    buf = BytesIO()
    bc.write(buf, options=options)
    out = buf.getvalue()
    buf.close()

    resp = HttpResponse(out, content_type='image/png')
    resp['Content-Disposition'] = f'inline; filename="barcode_{value}.png"'
    resp['Cache-Control'] = 'no-store, private'
    return resp


# ── PDF de etiquetas ─────────────────────────────────────────────────────


# Tamaño de cada etiqueta (63 × 30 mm). 3 columnas × 8 filas = 24 por hoja carta.
_LABEL_W = 63 * mm
_LABEL_H = 30 * mm
_GRID_COLS = 3
_GRID_ROWS = 8


def _label_drawing(item: InventoryItem) -> Table:
    """Crea una tabla-tarjeta compacta para la etiqueta del producto."""
    value = _barcode_value(item)
    barcode = _build_code128(value, width_mm=50.0, height_mm=11.0)
    barcode.hAlign = 'CENTER'

    styles = getSampleStyleSheet()
    name_style = ParagraphStyle(
        'lblName',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=7.5,
        alignment=1,  # CENTER
    )
    sku_style = ParagraphStyle(
        'lblSku',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6,
        leading=6.5,
        alignment=1,
        textColor=colors.HexColor('#0f172a'),
    )
    price_style = ParagraphStyle(
        'lblPrice',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=9.5,
        alignment=1,
        textColor=colors.HexColor('#dc2626'),
    )

    # Truncamos el nombre para que entre cómodo
    nombre = (item.name or '').strip()
    if len(nombre) > 36:
        nombre = nombre[:35] + '…'

    inner = [
        [Paragraph(nombre or '—', name_style)],
        [barcode],
        [Paragraph(value, sku_style)],
        [Paragraph(_fmt_q(item.unit_price), price_style)],
    ]
    tbl = Table(
        inner,
        colWidths=[_LABEL_W - 2 * mm],
        rowHeights=[4 * mm, 13 * mm, 3.5 * mm, 5.5 * mm],
    )
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('BOX', (0, 0), (-1, -1), 0.3, colors.HexColor('#94a3b8')),
    ]))
    return tbl


def _etiquetas_grid_pdf(items: list[InventoryItem]) -> bytes:
    """Compone N etiquetas en hojas carta a 3×8 (24 por hoja)."""
    if not items:
        return b''
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=8 * mm,
        rightMargin=8 * mm,
        topMargin=8 * mm,
        bottomMargin=8 * mm,
        title='Etiquetas',
    )

    cells: list[Table] = [_label_drawing(it) for it in items]
    cols = _GRID_COLS
    page_size = cols * _GRID_ROWS

    flowables: list = []
    for page_start in range(0, len(cells), page_size):
        page_cells = cells[page_start:page_start + page_size]
        rows: list[list[Table | str]] = []
        for r in range(0, len(page_cells), cols):
            chunk = page_cells[r:r + cols]
            if len(chunk) < cols:
                chunk = chunk + [''] * (cols - len(chunk))
            rows.append(chunk)

        grid = Table(
            rows,
            colWidths=[_LABEL_W] * cols,
            rowHeights=[_LABEL_H] * len(rows),
            hAlign='LEFT',
        )
        grid.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 1),
            ('RIGHTPADDING', (0, 0), (-1, -1), 1),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        flowables.append(grid)
        if page_start + page_size < len(cells):
            from reportlab.platypus import PageBreak
            flowables.append(PageBreak())

    doc.build(flowables)
    out = buf.getvalue()
    buf.close()
    return out


def etiqueta_pdf_response(item: InventoryItem, copies: int = 1) -> HttpResponse:
    """Devuelve un PDF con `copies` repeticiones de la etiqueta del producto."""
    copies = max(1, min(int(copies or 1), 100))
    items = [item] * copies
    pdf = _etiquetas_grid_pdf(items)
    resp = HttpResponse(pdf, content_type='application/pdf')
    fname = f'etiqueta_{_barcode_value(item)}.pdf'
    resp['Content-Disposition'] = f'attachment; filename="{fname}"'
    resp['Cache-Control'] = 'no-store, private'
    return resp


def etiquetas_lote_pdf_response(items: Iterable[InventoryItem], copies: int = 1) -> HttpResponse:
    """Genera un PDF con varios productos. Cada producto se repite `copies` veces."""
    copies = max(1, min(int(copies or 1), 50))
    expanded: list[InventoryItem] = []
    for it in items:
        expanded.extend([it] * copies)
    pdf = _etiquetas_grid_pdf(expanded)
    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = 'attachment; filename="etiquetas_lote.pdf"'
    resp['Cache-Control'] = 'no-store, private'
    return resp
