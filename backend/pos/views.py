from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Image as PdfImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from reports.pdf_brand import BOUTIQUE_PDF_PAGE_SIZE, pdf_header_image_bytes

from inventory.models import InventoryItem
from inventory.unit_hierarchy import split_stock_hierarchy
from stock.models import StockMovement

from .models import Customer, Quote, Sale
from .serializers import (
    CustomerSerializer,
    QuoteCreateSerializer,
    QuoteListSerializer,
    QuoteReadSerializer,
    SaleCreateSerializer,
    SaleListSerializer,
    SaleReadSerializer,
)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pos_ping(request):
    """Comprueba que el modulo POS responde (GET /api/v1/pos/ping/)."""
    return Response({'module': 'pos', 'ok': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pos_sales_dashboard_summary(request):
    """Totales, serie diaria y desglose por punto de operación para dashboard y estadísticas."""
    qs = Sale.objects.select_related('branch')
    total_count = qs.count()
    total_amount = qs.aggregate(s=Sum('total'))['s'] or Decimal('0')

    raw_days = request.query_params.get('days', '14')
    try:
        days = int(raw_days)
    except (TypeError, ValueError):
        days = 14
    days = max(1, min(days, 90))
    since = timezone.now() - timedelta(days=days)

    daily_rows = (
        qs.filter(created_at__gte=since)
        .annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(cnt=Count('id'), amt=Sum('total'))
        .order_by('day')
    )
    daily = [
        {
            'date': row['day'].isoformat() if row['day'] else None,
            'count': row['cnt'],
            'amount': str(row['amt'] or Decimal('0')),
        }
        for row in daily_rows
    ]

    by_branch_rows = (
        qs.values('branch_id', 'branch__name')
        .annotate(cnt=Count('id'), amt=Sum('total'))
        .order_by('-amt')[:24]
    )
    by_branch = [
        {
            'branch_id': row['branch_id'],
            'branch_name': row['branch__name'] or '',
            'count': row['cnt'],
            'amount': str(row['amt'] or Decimal('0')),
        }
        for row in by_branch_rows
    ]

    week_since = timezone.now() - timedelta(days=7)
    week_qs = qs.filter(created_at__gte=week_since)
    last_7_days_count = week_qs.count()
    last_7_days_amount = week_qs.aggregate(s=Sum('total'))['s'] or Decimal('0')

    pending_qs = qs.filter(payment_status__in=['credit', 'pending'])
    pending_count = pending_qs.count()
    pending_amount = pending_qs.aggregate(s=Sum('total'))['s'] or Decimal('0')

    return Response(
        {
            'total_count': total_count,
            'total_amount': str(total_amount),
            'last_7_days_count': last_7_days_count,
            'last_7_days_amount': str(last_7_days_amount),
            'daily': daily,
            'by_branch': by_branch,
            'pending_collection_count': pending_count,
            'pending_collection_amount': str(pending_amount),
        }
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sale_factura_pdf(request, pk: int):
    """Factura / ticket en PDF para una venta POS (cabecera + líneas)."""
    sale = get_object_or_404(
        Sale.objects.select_related('branch').prefetch_related('lines__inventory_item'),
        pk=pk,
    )
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=BOUTIQUE_PDF_PAGE_SIZE, title=f'Factura-{sale.pk}')
    styles = getSampleStyleSheet()
    heading_left = ParagraphStyle('facHeadingLeft', parent=styles['Heading2'], alignment=TA_LEFT)
    normal_left = ParagraphStyle('facNormalLeft', parent=styles['Normal'], alignment=TA_LEFT)
    h3_left = ParagraphStyle('facH3Left', parent=styles['Heading3'], alignment=TA_LEFT)
    italic_left = ParagraphStyle('facItalicLeft', parent=styles['Italic'], alignment=TA_LEFT)
    logo_buf = pdf_header_image_bytes()
    logo_buf.seek(0)
    with PILImage.open(logo_buf) as pil_im:
        lw, lh = pil_im.size
    logo_buf.seek(0)
    logo_max_w = 96.0
    logo_w = min(logo_max_w, float(lw)) if lw else logo_max_w
    logo_h = logo_w * (float(lh) / float(lw)) if lw else 28.0
    story = [
        PdfImage(logo_buf, width=logo_w, height=logo_h, hAlign='LEFT'),
        Spacer(1, 8),
        Paragraph('<b>Factura / Ticket de venta</b>', heading_left),
        Spacer(1, 8),
        Paragraph(f'<b>No. ticket:</b> {sale.pk}', normal_left),
        Paragraph(f'<b>Fecha:</b> {sale.created_at.strftime("%Y-%m-%d %H:%M")}', normal_left),
        Paragraph(f'<b>Forma de pago:</b> {sale.get_payment_method_display()}', normal_left),
        Spacer(1, 14),
    ]
    data = [['SKU', 'Producto', 'Cant.', 'P. unit.', 'Subtotal']]
    for ln in sale.lines.all():
        sub = Decimal(ln.unit_price) * ln.quantity
        data.append(
            [
                ln.inventory_item.sku,
                ln.inventory_item.name[:48],
                str(ln.quantity),
                str(ln.unit_price),
                str(sub),
            ]
        )
    tbl = Table(data, repeatRows=1, colWidths=[72, 200, 44, 72, 72])
    tbl.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#c40000')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.25, colors.grey),
            ]
        )
    )
    story.append(tbl)
    story.append(Spacer(1, 16))
    story.append(Paragraph(f'<b>Total a pagar: Q {sale.total}</b>', h3_left))
    story.append(Spacer(1, 24))
    story.append(
        Paragraph(
            'Documento generado electrónicamente a nivel de comprobante de venta. '
            'Conserve este archivo para sus registros contables.',
            italic_left,
        )
    )
    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="factura_ticket_{sale.pk}.pdf"'
    return resp


class SaleViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Listado, detalle, creación y eliminación de ventas POS (descuenta inventario al crear; lo restaura al borrar)."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Sale.objects.select_related('branch').prefetch_related('lines__inventory_item').all()
        branch = self.request.query_params.get('branch')
        if branch and str(branch).isdigit():
            qs = qs.filter(branch_id=int(branch))
        ps = self.request.query_params.get('payment_status')
        if ps in [c.value for c in Sale.PaymentStatus]:
            qs = qs.filter(payment_status=ps)
        elif ps == 'pending_collection':
            qs = qs.filter(payment_status__in=['credit', 'pending'])
        return qs.order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return SaleListSerializer
        return SaleReadSerializer

    def create(self, request, *args, **kwargs):
        ser = SaleCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        sale = ser.save()
        return Response(SaleReadSerializer(sale).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        """PATCH /pos/sales/{pk}/ — actualiza payment_status (y opcionalmente credit_note)."""
        sale = self.get_object()
        new_status = request.data.get('payment_status')
        allowed = [c.value for c in Sale.PaymentStatus]
        if new_status not in allowed:
            return Response(
                {'payment_status': f'Debe ser uno de: {", ".join(allowed)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        update_fields = ['payment_status']
        sale.payment_status = new_status
        if 'credit_note' in request.data:
            sale.credit_note = str(request.data['credit_note'])
            update_fields.append('credit_note')
        sale.save(update_fields=update_fields)
        return Response(SaleReadSerializer(sale).data)

    def perform_destroy(self, instance: Sale) -> None:
        with transaction.atomic():
            lines = list(instance.lines.select_related('inventory_item').all())
            for ln in lines:
                item = InventoryItem.objects.select_for_update().get(pk=ln.inventory_item_id)
                qty = int(ln.quantity)
                item.quantity += qty
                item.save(update_fields=['quantity'])
                f_j, p_j, u_j = split_stock_hierarchy(
                    qty, item.units_per_package, item.packages_per_fardo
                )
                StockMovement.objects.create(
                    inventory_item=item,
                    movement_type=StockMovement.MovementType.IN,
                    quantity=qty,
                    note=(
                        f'Anulación venta POS #{instance.pk} — {item.name} — {qty} u. '
                        f'(reint.: {f_j} f, {p_j} pq, {u_j} u)'
                    ),
                )
            instance.delete()


class CustomerViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Clientes POS: alta y listado con filtro por nombre."""

    permission_classes = [IsAuthenticated]
    serializer_class = CustomerSerializer

    def get_queryset(self):
        qs = Customer.objects.all().order_by('name', 'id')
        q = (self.request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(name__icontains=q)
        return qs


class QuoteViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Cotizaciones POS: creación y listado (no descuenta inventario)."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Quote.objects.prefetch_related('lines__inventory_item').all().order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return QuoteListSerializer
        if self.action == 'create':
            return QuoteCreateSerializer
        return QuoteReadSerializer

    def create(self, request, *args, **kwargs):
        ser = QuoteCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        quote: Quote = ser.save()
        return Response(QuoteReadSerializer(quote).data, status=status.HTTP_201_CREATED)
