from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from inventory.models import InventoryItem
from inventory.unit_hierarchy import split_stock_hierarchy
from stock.models import StockMovement

from .factura_pdf import build_factura_pdf, build_factura_ticket_pdf
from .models import Customer, Quote, Sale, SaleLine
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

    zero_cost = Value(Decimal('0'), output_field=DecimalField(max_digits=12, decimal_places=2))
    cost_f = Coalesce(
        F('inventory_item__cost_price'),
        zero_cost,
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )
    line_margin = ExpressionWrapper(
        F('quantity') * (F('unit_price') - cost_f),
        output_field=DecimalField(max_digits=16, decimal_places=2),
    )
    daily_profit_rows = (
        SaleLine.objects.filter(sale__created_at__gte=since)
        .annotate(day=TruncDate('sale__created_at'))
        .values('day')
        .annotate(profit=Sum(line_margin))
        .order_by('day')
    )
    profit_by_day = {
        row['day']: (row['profit'] if row['profit'] is not None else Decimal('0'))
        for row in daily_profit_rows
    }

    daily = [
        {
            'date': row['day'].isoformat() if row['day'] else None,
            'count': row['cnt'],
            'amount': str(row['amt'] or Decimal('0')),
            'profit': str(profit_by_day.get(row['day'], Decimal('0'))),
        }
        for row in daily_rows
    ]

    sales_qs = (
        qs.filter(created_at__gte=since)
        .annotate(
            sale_profit=Sum(
                ExpressionWrapper(
                    F('lines__quantity')
                    * (
                        F('lines__unit_price')
                        - Coalesce(
                            F('lines__inventory_item__cost_price'),
                            zero_cost,
                            output_field=DecimalField(max_digits=12, decimal_places=2),
                        )
                    ),
                    output_field=DecimalField(max_digits=18, decimal_places=2),
                )
            ),
            lines_count=Count('lines', distinct=True),
        )
        .order_by('-created_at')[:1000]
    )
    sales = [
        {
            'id': s.id,
            'created_at': s.created_at.isoformat(),
            'total': str(s.total),
            'profit': str(s.sale_profit if s.sale_profit is not None else Decimal('0')),
            'lines_count': int(s.lines_count or 0),
        }
        for s in sales_qs
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
            'sales': sales,
            'by_branch': by_branch,
            'pending_collection_count': pending_count,
            'pending_collection_amount': str(pending_amount),
        }
    )


def _sale_for_pdf(pk: int) -> Sale:
    return get_object_or_404(
        Sale.objects.select_related('branch', 'customer', 'fel__emisor')
        .prefetch_related('lines__inventory_item'),
        pk=pk,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sale_factura_pdf(request, pk: int):
    """Factura tamaño carta con datos FEL (Serie, autorización, totales, IVA)."""
    sale = _sale_for_pdf(pk)
    pdf, filename = build_factura_pdf(sale)
    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sale_factura_ticket_pdf(request, pk: int):
    """Ticket de 80mm (impresora térmica) con datos FEL."""
    sale = _sale_for_pdf(pk)
    pdf, filename = build_factura_ticket_pdf(sale)
    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
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
        qs = (
            Sale.objects.select_related('branch', 'fel')
            .prefetch_related('lines__inventory_item')
            .all()
        )
        branch = self.request.query_params.get('branch')
        if branch and str(branch).isdigit():
            qs = qs.filter(branch_id=int(branch))
        ps = self.request.query_params.get('payment_status')
        if ps in [c.value for c in Sale.PaymentStatus]:
            qs = qs.filter(payment_status=ps)
        elif ps == 'pending_collection':
            qs = qs.filter(payment_status__in=['credit', 'pending'])
        fel_estado = self.request.query_params.get('fel')
        if fel_estado in ('certificado', 'pendiente', 'rechazado', 'error'):
            qs = qs.filter(fel__estado=fel_estado)
        elif fel_estado == 'sin':
            qs = qs.filter(fel__isnull=True)
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
        """PATCH /pos/sales/{pk}/ — abono (`payment_abono`) o estado/credit_note."""
        sale = self.get_object()

        abono_raw = request.data.get('payment_abono')
        if abono_raw is not None and str(abono_raw).strip() != '':
            try:
                abono = Decimal(str(abono_raw).strip().replace(',', '.'))
            except Exception:
                return Response({'payment_abono': 'Importe inválido'}, status=status.HTTP_400_BAD_REQUEST)
            if abono <= 0:
                return Response(
                    {'payment_abono': 'El abono debe ser mayor que cero'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            total_due = sale.total or Decimal('0')
            current_paid = sale.amount_paid or Decimal('0')
            new_paid = current_paid + abono
            if new_paid > total_due:
                new_paid = total_due
            sale.amount_paid = new_paid
            uf = ['amount_paid']
            if sale.amount_paid >= total_due:
                sale.payment_status = Sale.PaymentStatus.PAID
                uf.append('payment_status')
            sale.save(update_fields=uf)
            return Response(SaleReadSerializer(sale).data)

        new_status = request.data.get('payment_status')
        allowed = [c.value for c in Sale.PaymentStatus]
        if new_status not in allowed:
            return Response(
                {'payment_status': f'Debe ser uno de: {", ".join(allowed)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sale.payment_status = new_status
        update_fields = ['payment_status']
        if new_status == Sale.PaymentStatus.PAID.value:
            sale.amount_paid = sale.total or Decimal('0')
            update_fields.append('amount_paid')
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
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Clientes POS: CRUD completo con soft-delete y filtro por nombre/NIT."""

    permission_classes = [IsAuthenticated]
    serializer_class = CustomerSerializer

    def get_queryset(self):
        qs = Customer.objects.all().order_by('name', 'id')
        include_inactive = (self.request.query_params.get('include_inactive') or '').lower() in (
            '1', 'true', 'yes',
        )
        # Las acciones de detalle (retrieve/update/destroy) deben poder acceder
        # también a clientes inactivos para poder reactivarlos / borrarlos.
        if self.action == 'list' and not include_inactive:
            qs = qs.filter(is_active=True)
        q = (self.request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(name__icontains=q) | Q(nit__icontains=q) | Q(phone__icontains=q)
            )
        return qs

    def perform_destroy(self, instance: Customer) -> None:
        """Soft-delete por defecto. Con `?hard=1` borra físicamente si es seguro.

        Si el cliente tiene ventas asociadas (FK PROTECT) el hard delete fallará;
        en ese caso devolvemos un mensaje claro y dejamos el soft-delete como
        fallback automático.
        """
        hard = (self.request.query_params.get('hard') or '').lower() in ('1', 'true', 'yes')
        if hard:
            from django.db.models import ProtectedError
            try:
                instance.delete()
                return
            except ProtectedError:
                # Tiene ventas; caemos a soft-delete.
                pass
        instance.is_active = False
        instance.save(update_fields=['is_active'])

    @action(detail=True, methods=['post'], url_path='restore')
    def restore(self, request, pk=None):
        """Reactivar un cliente previamente desactivado."""
        customer = self.get_object()
        if customer.is_active:
            return Response({'detail': 'El cliente ya está activo.'}, status=status.HTTP_200_OK)
        customer.is_active = True
        customer.save(update_fields=['is_active'])
        return Response(CustomerSerializer(customer).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='lookup-by-nit')
    def lookup_by_nit(self, request):
        """GET /api/v1/pos/customers/lookup-by-nit/?nit=XXXXXX

        Búsqueda exacta por NIT (ignora guion y espacios). Devuelve
        {"found": true, "customer": {...}} si existe; en caso contrario
        {"found": false, "nit": "<normalizado>"}.
        """
        raw = (request.query_params.get('nit') or '').strip().upper()
        if not raw:
            return Response({'detail': 'Indique un NIT.'}, status=status.HTTP_400_BAD_REQUEST)
        nit = raw.replace('-', '').replace(' ', '')
        if not nit:
            return Response({'found': False, 'nit': nit})
        customer = Customer.objects.filter(
            Q(nit__iexact=raw) | Q(nit__iexact=nit)
        ).first()
        if customer is None:
            # también soportar match aproximado por número (ignorando símbolos)
            for c in Customer.objects.exclude(nit='').only('id', 'nit'):
                norm = (c.nit or '').upper().replace('-', '').replace(' ', '')
                if norm == nit:
                    customer = Customer.objects.get(pk=c.pk)
                    break
        if customer is None:
            return Response({'found': False, 'nit': nit})
        return Response({'found': True, 'customer': CustomerSerializer(customer).data})


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
