from decimal import Decimal

from django.db import transaction
from rest_framework import serializers
from stock.models import StockMovement

from branches.models import Branch
from inventory.models import InventoryItem
from inventory.unit_hierarchy import split_stock_hierarchy

from .models import Sale, SaleLine


class SaleLineListRowSerializer(serializers.ModelSerializer):
    """Línea compacta para listados (pedidos / vista previa)."""

    product_name = serializers.CharField(source='inventory_item.name', read_only=True)
    sku = serializers.CharField(source='inventory_item.sku', read_only=True)
    display_order = serializers.IntegerField(source='inventory_item.display_order', read_only=True)
    cost_price = serializers.DecimalField(
        source='inventory_item.cost_price', max_digits=10, decimal_places=2, read_only=True
    )
    fardos = serializers.SerializerMethodField()
    paquetes = serializers.SerializerMethodField()
    unidades = serializers.SerializerMethodField()

    class Meta:
        model = SaleLine
        fields = [
            'id',
            'inventory_item',
            'product_name',
            'sku',
            'display_order',
            'quantity',
            'fardos',
            'paquetes',
            'unidades',
            'cost_price',
            'unit_price',
        ]

    def _split(self, obj: SaleLine):
        item = obj.inventory_item
        return split_stock_hierarchy(obj.quantity, item.units_per_package, item.packages_per_fardo)

    def get_fardos(self, obj: SaleLine) -> int:
        return self._split(obj)[0]

    def get_paquetes(self, obj: SaleLine) -> int:
        return self._split(obj)[1]

    def get_unidades(self, obj: SaleLine) -> int:
        return self._split(obj)[2]


class SaleLineReadSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='inventory_item.name', read_only=True)
    sku = serializers.CharField(source='inventory_item.sku', read_only=True)
    jerarquia = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SaleLine
        fields = ['id', 'inventory_item', 'product_name', 'sku', 'quantity', 'unit_price', 'jerarquia']

    def get_jerarquia(self, obj: SaleLine):
        item = obj.inventory_item
        f, p, u = split_stock_hierarchy(obj.quantity, item.units_per_package, item.packages_per_fardo)
        return {
            'fardos': f,
            'paquetes': p,
            'unidades': u,
            'total_unidades': obj.quantity,
        }


class SaleReadSerializer(serializers.ModelSerializer):
    lines = SaleLineReadSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Sale
        fields = [
            'id',
            'branch',
            'branch_name',
            'payment_method',
            'total',
            'created_at',
            'lines',
        ]
        read_only_fields = fields


class SaleLineWriteSerializer(serializers.Serializer):
    inventory_item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.all())
    quantity = serializers.IntegerField(min_value=1)


class SaleCreateSerializer(serializers.Serializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all())
    payment_method = serializers.ChoiceField(choices=[c.value for c in Sale.Payment])
    lines = SaleLineWriteSerializer(many=True, min_length=1)

    def create(self, validated_data):
        branch: Branch = validated_data['branch']
        payment_method = validated_data['payment_method']
        line_inputs = validated_data['lines']

        with transaction.atomic():
            total = Decimal('0')
            sale = Sale.objects.create(
                branch=branch,
                payment_method=payment_method,
                total=Decimal('0'),
            )
            lines_to_create: list[SaleLine] = []

            for row in line_inputs:
                item: InventoryItem = row['inventory_item']
                qty = int(row['quantity'])
                if item.branch_id != branch.pk:
                    raise serializers.ValidationError(
                        {'lines': f'El producto "{item.sku}" no pertenece al punto de inventario seleccionado.'},
                    )
                item = InventoryItem.objects.select_for_update().get(pk=item.pk)
                if item.quantity < qty:
                    raise serializers.ValidationError(
                        {'lines': f'Stock insuficiente para "{item.sku}" (disponible {item.quantity}, pedido {qty}).'},
                    )
                unit_price = item.unit_price
                line_total = unit_price * qty
                total += line_total
                item.quantity -= qty
                item.save(update_fields=['quantity'])
                f_j, p_j, u_j = split_stock_hierarchy(qty, item.units_per_package, item.packages_per_fardo)
                StockMovement.objects.create(
                    inventory_item=item,
                    movement_type=StockMovement.MovementType.OUT,
                    quantity=qty,
                    note=(
                        f'Venta POS #{sale.pk} — {item.name} — {qty} u. '
                        f'(desc.: {f_j} f, {p_j} pq, {u_j} u)'
                    ),
                )
                lines_to_create.append(
                    SaleLine(
                        sale=sale,
                        inventory_item=item,
                        quantity=qty,
                        unit_price=unit_price,
                    ),
                )

            SaleLine.objects.bulk_create(lines_to_create)
            sale.total = total
            sale.save(update_fields=['total'])

        return sale


class SaleListSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    lines_count = serializers.SerializerMethodField()
    total_units = serializers.SerializerMethodField()
    lines = SaleLineListRowSerializer(many=True, read_only=True)

    class Meta:
        model = Sale
        fields = [
            'id',
            'branch',
            'branch_name',
            'payment_method',
            'total',
            'created_at',
            'lines_count',
            'total_units',
            'lines',
        ]

    def get_lines_count(self, obj: Sale) -> int:
        # Con prefetch_related('lines'), all() usa caché y evita N+1.
        return len(obj.lines.all())

    def get_total_units(self, obj: Sale) -> int:
        return sum(int(ln.quantity) for ln in obj.lines.all())
