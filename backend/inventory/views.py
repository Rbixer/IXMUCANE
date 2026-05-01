from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q
from django.db.models.deletion import ProtectedError
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from pos.models import Sale, SaleLine
from stock.models import StockMovement
from suppliers.models import PurchaseLine, PurchaseOrder

from .models import InventoryItem, ProductCategory
from .serializers import InventoryItemSerializer, ProductCategorySerializer


class ProductCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ProductCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ProductCategory.objects.all()
        line = self.request.query_params.get('line')
        if line:
            qs = qs.filter(Q(line=line) | Q(line=''))
        return qs.order_by('line', 'name')


class InventoryItemViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryItemSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @staticmethod
    def _registrar_stock(item: InventoryItem, cantidad_movimiento: int, tipo: str) -> None:
        if cantidad_movimiento <= 0:
            return
        movement_type = (
            StockMovement.MovementType.IN if tipo == 'IN' else StockMovement.MovementType.OUT
        )
        StockMovement.objects.create(
            inventory_item=item,
            movement_type=movement_type,
            quantity=cantidad_movimiento,
            note=f'{item.name} — Stock en tienda: {item.quantity}',
        )

    def perform_create(self, serializer):
        with transaction.atomic():
            item = serializer.save()
            self._registrar_stock(item, item.quantity, 'IN')

    def perform_update(self, serializer):
        prev = self.get_object()
        prev_qty = prev.quantity
        with transaction.atomic():
            item = serializer.save()
            delta = item.quantity - prev_qty
            if delta > 0:
                self._registrar_stock(item, delta, 'IN')
            elif delta < 0:
                self._registrar_stock(item, abs(delta), 'OUT')

    def perform_destroy(self, instance: InventoryItem) -> None:
        """
        Quita líneas de venta y de órdenes de compra que referencian el ítem (PROTECT impedía borrarlo).
        Recalcula totales de ventas; borra ventas u órdenes que queden sin líneas.
        """
        with transaction.atomic():
            sale_ids = list(
                SaleLine.objects.filter(inventory_item=instance).values_list('sale_id', flat=True).distinct()
            )
            SaleLine.objects.filter(inventory_item=instance).delete()
            for sid in sale_ids:
                sale = Sale.objects.filter(pk=sid).select_for_update().first()
                if sale is None:
                    continue
                remaining = list(sale.lines.all())
                if not remaining:
                    sale.delete()
                else:
                    total = sum(
                        (Decimal(str(ln.unit_price)) * ln.quantity for ln in remaining),
                        start=Decimal('0'),
                    )
                    sale.total = total
                    sale.save(update_fields=['total'])

            order_ids = list(
                PurchaseLine.objects.filter(inventory_item=instance)
                .values_list('order_id', flat=True)
                .distinct()
            )
            PurchaseLine.objects.filter(inventory_item=instance).delete()
            for oid in order_ids:
                if not PurchaseLine.objects.filter(order_id=oid).exists():
                    PurchaseOrder.objects.filter(pk=oid).delete()

            try:
                instance.delete()
            except ProtectedError as exc:
                raise ValidationError(
                    'No se puede eliminar el producto: aún hay otros registros que lo referencian '
                    'en la base de datos. Revise en administración Django o contacte soporte.'
                ) from exc

    def get_queryset(self):
        qs = InventoryItem.objects.select_related('branch', 'category').all()
        line = self.request.query_params.get('line')
        branch = self.request.query_params.get('branch')
        category = self.request.query_params.get('category')
        if line:
            qs = qs.filter(line=line)
        if branch:
            qs = qs.filter(branch_id=branch)
        if category:
            qs = qs.filter(category_id=category)
        return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_count(request):
    return Response({'count': InventoryItem.objects.count()})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_branch_summary(request):
    """
    Conteos por punto de inventario: productos totales, por línea (dama/caballero) y movimientos de stock
    asociados solo a productos que siguen existiendo en inventario.
    """
    inv_by_branch: dict[int, dict] = {}
    for row in InventoryItem.objects.values('branch').annotate(
        total=Count('id'),
        ropa_dama=Count('id', filter=Q(line=InventoryItem.Line.ROPA_DAMA)),
        ropa_caballero=Count('id', filter=Q(line=InventoryItem.Line.ROPA_CABALLERO)),
    ):
        inv_by_branch[row['branch']] = {
            'total': row['total'],
            'ropa-dama': row['ropa_dama'],
            'ropa-caballero': row['ropa_caballero'],
        }

    valid_item_ids = InventoryItem.objects.values_list('id', flat=True)
    stock_by_branch: defaultdict[int, int] = defaultdict(int)
    for row in (
        StockMovement.objects.filter(inventory_item_id__in=valid_item_ids)
        .values('inventory_item__branch_id')
        .annotate(c=Count('id'))
    ):
        bid = row['inventory_item__branch_id']
        if bid is not None:
            stock_by_branch[bid] = row['c']

    branch_ids = set(inv_by_branch.keys()) | set(stock_by_branch.keys())
    out: dict[str, dict] = {}
    for bid in branch_ids:
        inv = inv_by_branch.get(
            bid, {'total': 0, 'ropa-dama': 0, 'ropa-caballero': 0}
        )
        out[str(bid)] = {
            **inv,
            'stock_movimientos': stock_by_branch[bid],
        }
    return Response(out)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_locales_list(request):
    """Listado de puntos de inventario (tiendas activas) para desplegables del panel."""
    from branches.models import Branch

    rows = Branch.objects.filter(is_active=True).order_by('name')
    data = [
        {
            'id': b.pk,
            'name': b.name,
            'city': b.city,
            'address': b.address,
            'maps_url': b.maps_url or '',
            'manager': b.manager,
            'is_active': b.is_active,
            'created_at': b.created_at.isoformat() if b.created_at else None,
        }
        for b in rows
    ]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_locales_count(request):
    from branches.models import Branch

    return Response({'count': Branch.objects.filter(is_active=True).count()})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def inventory_transfer_by_branch(request):
    """
    Traslada en lote productos de un punto de inventario a otro.
    Body JSON: { "from_branch_id": number, "to_branch_id": number }
    """
    from_raw = request.data.get('from_branch_id')
    to_raw = request.data.get('to_branch_id')
    try:
        from_id = int(from_raw)
        to_id = int(to_raw)
    except (TypeError, ValueError):
        return Response({'detail': 'from_branch_id y to_branch_id deben ser enteros positivos.'}, status=status.HTTP_400_BAD_REQUEST)

    if from_id <= 0 or to_id <= 0:
        return Response({'detail': 'from_branch_id y to_branch_id deben ser mayores que 0.'}, status=status.HTTP_400_BAD_REQUEST)
    if from_id == to_id:
        return Response({'detail': 'El origen y destino no pueden ser iguales.'}, status=status.HTTP_400_BAD_REQUEST)

    updated = InventoryItem.objects.filter(branch_id=from_id).update(branch_id=to_id)
    return Response({'moved': updated, 'from_branch_id': from_id, 'to_branch_id': to_id})
