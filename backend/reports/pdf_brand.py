"""Cabecera visual para PDFs (logo empresa en static o cabecera tipográfica de respaldo)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from django.conf import settings
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import letter

# Carta (8.5" × 11"), vertical — mismo tamaño para reportes y facturas POS.
BOUTIQUE_PDF_PAGE_SIZE = letter

BRAND_RGB = (196, 0, 0)
_IMG_W, _IMG_H = 720, 96


def _load_bold(size: int) -> ImageFont.ImageFont:
    for path in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _load_regular(size: int) -> ImageFont.ImageFont:
    for path in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def company_logo_png_bytes() -> BytesIO | None:
    """PNG de marca en `static/site/brand-logo-boutique.png` (mismo archivo que el admin)."""
    path = Path(settings.BASE_DIR) / 'static' / 'site' / 'brand-logo-boutique.png'
    if not path.is_file():
        return None
    buf = BytesIO(path.read_bytes())
    buf.seek(0)
    return buf


def pdf_header_image_bytes() -> BytesIO:
    """Buffer PNG para ReportLab: logo de empresa si existe; si no, cabecera generada."""
    logo = company_logo_png_bytes()
    if logo is not None:
        return logo
    return brand_header_png_bytes()


def brand_header_png_bytes() -> BytesIO:
    """PNG horizontal listo para ReportLab (logo tipográfico + acento de marca)."""
    img = Image.new('RGB', (_IMG_W, _IMG_H), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, _IMG_W, 5], fill=BRAND_RGB)
    draw.rectangle([0, _IMG_H - 5, _IMG_W, _IMG_H], fill=BRAND_RGB)

    font_title = _load_bold(28)
    font_sub = _load_regular(15)
    cx = _IMG_W // 2
    draw.text((cx, 30), 'ALUMINIOS IXMUCANE', fill=(18, 18, 18), font=font_title, anchor='mm')
    draw.text((cx, 58), 'Calidad en aluminio · Reporte del sistema', fill=(70, 70, 70), font=font_sub, anchor='mm')

    out = BytesIO()
    img.save(out, format='PNG', optimize=True)
    out.seek(0)
    return out
