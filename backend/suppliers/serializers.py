from django.db import transaction
from rest_framework import serializers
from stock.models import StockMovement

from branches.models import Branch
from inventory.models import InventoryItem
from inventory.unit_hierarchy import split_stock_hierarchy

from .models import PurchaseLine, PurchaseOrder, Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ['id', 'name', 'contact', 'nit', 'razon_social', 'notes', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {
            'name': {'required': False, 'allow_blank': True},
            'contact': {'required': False, 'allow_blank': True},
            'nit': {'required': False, 'allow_blank': True},
            'razon_social': {'required': False, 'allow_blank': True},
            'notes': {'required': False, 'allow_blank': True},
        }


class PurchaseLineReadSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source='inventory_item.sku', read_only=True)
    product_name = serializers.CharField(source='inventory_item.name', read_only=True)
    display_order = serializers.IntegerField(source='inventory_item.display_order', read_only=True)
    cost_price = serializers.DecimalField(
        source='inventory_item.cost_price', max_digits=10, decimal_places=2, read_only=True
    )
    unit_price = serializers.DecimalField(
        source='inventory_item.unit_price', max_digits=10, decimal_places=2, read_only=True
    )
    fardos = serializers.SerializerMethodField()
    paquetes = serializers.SerializerMethodField()
    unidades = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseLine
        fields = [
            'id',
            'inventory_item',
            'sku',
            'product_name',
            'display_order',
            'quantity',
            'fardos',
            'paquetes',
            'unidades',
            'cost_price',
            'unit_price',
        ]

    def _split(self, obj: PurchaseLine):
        item = obj.inventory_item
        return split_stock_hierarchy(obj.quantity, item.units_per_package, item.packages_per_fardo)

    def get_fardos(self, obj: PurchaseLine) -> int:
        return self._split(obj)[0]

    def get_paquetes(self, obj: PurchaseLine) -> int:
        return self._split(obj)[1]

    def get_unidades(self, obj: PurchaseLine) -> int:
        return self._split(obj)[2]


class PurchaseOrderReadSerializer(serializers.ModelSerializer):
    lines = PurchaseLineReadSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ['id', 'supplier', 'supplier_name', 'branch', 'branch_name', 'reference', 'created_at', 'lines']
        read_only_fields = fields


class PurchaseLineWriteSerializer(serializers.Serializer):
    inventory_item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.all())
    quantity = serializers.IntegerField(min_value=1)


class PurchaseOrderCreateSerializer(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all())
    reference = serializers.CharField(max_length=120, allow_blank=True, default='')
    lines = PurchaseLineWriteSerializer(many=True, min_length=1)

    def create(self, validated_data):
        supplier = validated_data['supplier']
        branch: Branch = validated_data['branch']
        reference = (validated_data.get('reference') or '').strip()
        line_inputs = validated_data['lines']

        with transaction.atomic():
            order = PurchaseOrder.objects.create(
                supplier=supplier,
                branch=branch,
                reference=reference,
            )
            bulk_lines: list[PurchaseLine] = []

            for row in line_inputs:
                item: InventoryItem = row['inventory_item']
                qty = int(row['quantity'])
                if item.branch_id != branch.pk:
                    raise serializers.ValidationError(
                        {'lines': f'El producto "{item.sku}" no pertenece a la tienda de la orden.'},
                    )
                item = InventoryItem.objects.select_for_update().get(pk=item.pk)
                item.quantity += qty
                item.save(update_fields=['quantity'])
                StockMovement.objects.create(
                    inventory_item=item,
                    movement_type=StockMovement.MovementType.IN,
                    quantity=qty,
                    note=f'Recepcion proveedor OC #{order.pk} — {supplier.name} — {item.name}',
                )
                bulk_lines.append(
                    PurchaseLine(
                        order=order,
                        inventory_item=item,
                        quantity=qty,
                    ),
                )

            PurchaseLine.objects.bulk_create(bulk_lines)

        return order


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    lines_count = serializers.SerializerMethodField()
    lines = PurchaseLineReadSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id',
            'supplier',
            'supplier_name',
            'branch',
            'branch_name',
            'reference',
            'created_at',
            'lines_count',
            'lines',
        ]

    def get_lines_count(self, obj: PurchaseOrder) -> int:
        return obj.lines.count()
