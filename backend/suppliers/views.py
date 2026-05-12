from django.db import transaction

from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from inventory.models import InventoryItem
from inventory.unit_hierarchy import split_stock_hierarchy
from stock.models import StockMovement

from .models import PurchaseOrder, Supplier
from .serializers import (
    PurchaseOrderCreateSerializer,
    PurchaseOrderListSerializer,
    PurchaseOrderReadSerializer,
    SupplierSerializer,
)


class SupplierViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Supplier.objects.all()
        include_inactive = str(self.request.query_params.get('include_inactive', '')).lower() in ('1', 'true')
        if not include_inactive:
            qs = qs.filter(is_active=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        """Soft-delete por defecto. Pasar `?hard=1` para borrado físico (rechazado si tiene órdenes)."""
        supplier = self.get_object()
        hard = str(request.query_params.get('hard', '')).lower() in ('1', 'true')
        if not hard:
            if supplier.is_active:
                supplier.is_active = False
                supplier.save(update_fields=['is_active'])
            return Response(status=status.HTTP_204_NO_CONTENT)
        if supplier.purchase_orders.exists():
            return Response(
                {
                    'detail': 'No se puede eliminar el proveedor: tiene órdenes de compra registradas.',
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)


class PurchaseOrderViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = PurchaseOrder.objects.select_related('supplier', 'branch').prefetch_related('lines__inventory_item').all()
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        branch = self.request.query_params.get('branch')
        include_inactive = str(self.request.query_params.get('include_inactive', '')).lower() in ('1', 'true')
        if not include_inactive:
            qs = qs.filter(is_active=True)
        if branch and str(branch).isdigit():
            qs = qs.filter(branch_id=int(branch))
        return qs.order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return PurchaseOrderListSerializer
        return PurchaseOrderReadSerializer

    def create(self, request, *args, **kwargs):
        ser = PurchaseOrderCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        order = ser.save()
        return Response(PurchaseOrderReadSerializer(order).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance: PurchaseOrder) -> None:
        """Soft-delete por defecto: oculta la orden sin tocar stock.

        Con `?hard=1` se ejecuta el flujo histórico que revierte stock
        (validando que no quede negativo) y borra físicamente la orden.
        """
        hard = str(self.request.query_params.get('hard', '')).lower() in ('1', 'true')
        if not hard:
            if instance.is_active:
                instance.is_active = False
                instance.save(update_fields=['is_active'])
            return

        with transaction.atomic():
            lines = list(instance.lines.select_related('inventory_item').all())
            for ln in lines:
                item = InventoryItem.objects.select_for_update().get(pk=ln.inventory_item_id)
                qty = int(ln.quantity)
                if item.quantity < qty:
                    raise ValidationError(
                        {
                            'detail': (
                                f'No se puede eliminar la orden: el stock actual de «{item.sku}» ({item.quantity}) '
                                f'es menor que lo recibido en la orden ({qty}). Revise movimientos o ventas.'
                            )
                        }
                    )
                item.quantity -= qty
                item.save(update_fields=['quantity'])
                f_j, p_j, u_j = split_stock_hierarchy(qty, item.units_per_package, item.packages_per_fardo)
                StockMovement.objects.create(
                    inventory_item=item,
                    movement_type=StockMovement.MovementType.OUT,
                    quantity=qty,
                    note=(
                        f'Anulación OC #{instance.pk} — {item.name} — {qty} u. '
                        f'(rev. recepción: {f_j} f, {p_j} pq, {u_j} u)'
                    ),
                )
            instance.delete()
