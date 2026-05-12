from decimal import Decimal

from django.db import transaction
from rest_framework import serializers
from stock.models import StockMovement

from branches.models import Branch
from inventory.models import InventoryItem
from inventory.unit_hierarchy import split_stock_hierarchy

from .models import Customer, Quote, QuoteLine, Sale, SaleLine


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ['id', 'name', 'nit', 'phone', 'email', 'address', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


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


def _fel_summary(obj: Sale) -> dict:
    """Devuelve un resumen del estado FEL para listas y detalles, o None si no hay."""
    fel = getattr(obj, 'fel', None)
    if fel is None:
        return None
    return {
        'estado': fel.estado,
        'serie': fel.serie or '',
        'numero_autorizacion': fel.numero_autorizacion or '',
        'fecha_certificacion': (
            fel.fecha_certificacion.isoformat() if fel.fecha_certificacion else None
        ),
        'ambiente': fel.ambiente,
    }


class SaleReadSerializer(serializers.ModelSerializer):
    lines = SaleLineReadSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    balance_due = serializers.SerializerMethodField()
    fel = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id',
            'branch',
            'branch_name',
            'customer',
            'customer_name',
            'customer_nit',
            'customer_phone',
            'customer_email',
            'customer_address',
            'payment_method',
            'payment_status',
            'credit_days',
            'credit_note',
            'discount',
            'total',
            'amount_paid',
            'balance_due',
            'is_envio',
            'created_at',
            'lines',
            'fel',
        ]
        read_only_fields = fields

    def get_balance_due(self, obj: Sale) -> str:
        total = obj.total or Decimal('0')
        paid = obj.amount_paid or Decimal('0')
        return str(max(Decimal('0'), total - paid))

    def get_fel(self, obj: Sale):
        return _fel_summary(obj)


class SaleLineWriteSerializer(serializers.Serializer):
    inventory_item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    unit_kind = serializers.ChoiceField(
        choices=['unit', 'package', 'fardo'],
        default='unit',
        required=False,
    )
    unit_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=Decimal('0'),
        required=False,
        allow_null=True,
    )


def _sale_line_multiplier(unit_kind: str, upk: int, ppf: int) -> int:
    """Unidades base por 1 item de la unidad seleccionada."""
    if unit_kind == 'fardo':
        return max(1, upk) * max(1, ppf)
    if unit_kind == 'package':
        return max(1, upk)
    return 1


class SaleCreateSerializer(serializers.Serializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all())
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), required=False, allow_null=True
    )
    customer_name = serializers.CharField(required=False, allow_blank=True, default='')
    customer_nit = serializers.CharField(required=False, allow_blank=True, default='')
    customer_phone = serializers.CharField(required=False, allow_blank=True, default='')
    customer_email = serializers.CharField(required=False, allow_blank=True, default='')
    customer_address = serializers.CharField(required=False, allow_blank=True, default='')
    payment_method = serializers.ChoiceField(choices=[c.value for c in Sale.Payment])
    payment_status = serializers.ChoiceField(
        choices=[c.value for c in Sale.PaymentStatus],
        default=Sale.PaymentStatus.PAID,
        required=False,
    )
    credit_days = serializers.IntegerField(min_value=0, default=0, required=False)
    credit_note = serializers.CharField(required=False, allow_blank=True, default='')
    discount = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal('0'),
        default=Decimal('0'), required=False,
    )
    is_envio = serializers.BooleanField(default=False, required=False)
    lines = SaleLineWriteSerializer(many=True, min_length=1)

    def create(self, validated_data):
        branch: Branch = validated_data['branch']
        customer: Customer | None = validated_data.get('customer')
        customer_name = (validated_data.get('customer_name') or '').strip()
        customer_nit = (validated_data.get('customer_nit') or '').strip()
        customer_phone = (validated_data.get('customer_phone') or '').strip()
        customer_email = (validated_data.get('customer_email') or '').strip()
        customer_address = (validated_data.get('customer_address') or '').strip()
        if customer is not None:
            customer_name = customer.name
            customer_nit = customer.nit or customer_nit
            customer_phone = customer.phone
            customer_email = customer.email
            customer_address = customer.address
        payment_method = validated_data['payment_method']
        payment_status = validated_data.get('payment_status', Sale.PaymentStatus.PAID)
        credit_days = int(validated_data.get('credit_days') or 0)
        credit_note = (validated_data.get('credit_note') or '').strip()
        discount = Decimal(str(validated_data.get('discount') or 0))
        is_envio = bool(validated_data.get('is_envio') or False)
        line_inputs = validated_data['lines']

        with transaction.atomic():
            total = Decimal('0')
            sale = Sale.objects.create(
                branch=branch,
                customer=customer,
                customer_name=customer_name,
                customer_nit=customer_nit,
                customer_phone=customer_phone,
                customer_email=customer_email,
                customer_address=customer_address,
                payment_method=payment_method,
                payment_status=payment_status,
                credit_days=credit_days,
                credit_note=credit_note,
                discount=discount,
                is_envio=is_envio,
                total=Decimal('0'),
            )
            lines_to_create: list[SaleLine] = []

            for row in line_inputs:
                item: InventoryItem = row['inventory_item']
                qty_user = int(row['quantity'])
                unit_kind = row.get('unit_kind') or 'unit'

                upk = max(1, int(item.units_per_package or 1))
                ppf = max(1, int(item.packages_per_fardo or 1))
                multiplier = _sale_line_multiplier(unit_kind, upk, ppf)
                base_units = qty_user * multiplier

                # Precio por unidad-usuario: override o precio del tipo
                override = row.get('unit_price')
                if override is not None and override >= Decimal('0'):
                    price_per_user_unit = Decimal(str(override))
                elif unit_kind == 'fardo':
                    fp = Decimal(str(item.fardo_price or 0))
                    price_per_user_unit = fp if fp > 0 else Decimal(str(item.unit_price)) * multiplier
                elif unit_kind == 'package':
                    pp = Decimal(str(item.package_price or 0))
                    price_per_user_unit = pp if pp > 0 else Decimal(str(item.unit_price)) * multiplier
                else:
                    price_per_user_unit = Decimal(str(item.unit_price))

                # Precio por unidad base (para almacenamiento consistente)
                price_per_base = price_per_user_unit / multiplier

                item = InventoryItem.objects.select_for_update().get(pk=item.pk)
                if item.quantity < base_units:
                    raise serializers.ValidationError(
                        {
                            'lines': (
                                f'Stock insuficiente para "{item.sku}" '
                                f'(disponible {item.quantity} u., pedido {base_units} u.).'
                            )
                        },
                    )

                line_total = price_per_user_unit * qty_user
                total += line_total
                item.quantity -= base_units
                item.save(update_fields=['quantity'])

                f_j, p_j, u_j = split_stock_hierarchy(base_units, item.units_per_package, item.packages_per_fardo)
                kind_label = {'fardo': 'fardo', 'package': 'paquete'}.get(unit_kind, 'unidad')
                StockMovement.objects.create(
                    inventory_item=item,
                    movement_type=StockMovement.MovementType.OUT,
                    quantity=base_units,
                    note=(
                        f'Venta POS #{sale.pk} — {item.name} — '
                        f'{qty_user} {kind_label}(s) → {base_units} u. '
                        f'(desc.: {f_j} f, {p_j} pq, {u_j} u)'
                    ),
                )
                lines_to_create.append(
                    SaleLine(
                        sale=sale,
                        inventory_item=item,
                        quantity=base_units,
                        unit_price=price_per_base,
                    ),
                )

            SaleLine.objects.bulk_create(lines_to_create)
            sale.total = max(Decimal('0'), total - discount)
            if payment_status == Sale.PaymentStatus.PAID:
                sale.amount_paid = sale.total
            else:
                sale.amount_paid = Decimal('0')
            sale.save(update_fields=['total', 'amount_paid'])

        return sale


class SaleListSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    lines_count = serializers.SerializerMethodField()
    total_units = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()
    lines = SaleLineListRowSerializer(many=True, read_only=True)
    fel = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id',
            'branch',
            'branch_name',
            'customer',
            'customer_name',
            'customer_nit',
            'customer_phone',
            'customer_email',
            'customer_address',
            'payment_method',
            'payment_status',
            'credit_days',
            'credit_note',
            'discount',
            'total',
            'amount_paid',
            'balance_due',
            'is_envio',
            'created_at',
            'lines_count',
            'total_units',
            'lines',
            'fel',
        ]

    def get_fel(self, obj: Sale):
        return _fel_summary(obj)

    def get_balance_due(self, obj: Sale) -> str:
        total = obj.total or Decimal('0')
        paid = obj.amount_paid or Decimal('0')
        return str(max(Decimal('0'), total - paid))

    def get_lines_count(self, obj: Sale) -> int:
        # Con prefetch_related('lines'), all() usa caché y evita N+1.
        return len(obj.lines.all())

    def get_total_units(self, obj: Sale) -> int:
        return sum(int(ln.quantity) for ln in obj.lines.all())


class QuoteLineReadSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='inventory_item.name', read_only=True)
    sku = serializers.CharField(source='inventory_item.sku', read_only=True)

    class Meta:
        model = QuoteLine
        fields = [
            'id',
            'inventory_item',
            'product_name',
            'sku',
            'quantity',
            'unit_kind',
            'line_unit_price',
        ]
        read_only_fields = fields


class QuoteReadSerializer(serializers.ModelSerializer):
    lines = QuoteLineReadSerializer(many=True, read_only=True)

    class Meta:
        model = Quote
        fields = [
            'id',
            'customer_name',
            'customer_nit',
            'notes',
            'total',
            'created_at',
            'lines',
        ]
        read_only_fields = fields


class QuoteListSerializer(serializers.ModelSerializer):
    lines_count = serializers.SerializerMethodField()

    class Meta:
        model = Quote
        fields = [
            'id',
            'customer_name',
            'customer_nit',
            'notes',
            'total',
            'created_at',
            'lines_count',
        ]
        read_only_fields = fields

    def get_lines_count(self, obj: Quote) -> int:
        return len(obj.lines.all())


class QuoteLineWriteSerializer(serializers.Serializer):
    inventory_item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    unit_kind = serializers.ChoiceField(choices=[c.value for c in QuoteLine.UnitKind])
    line_unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0'))


class QuoteCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(required=False, allow_blank=True, default='')
    customer_nit = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    lines = QuoteLineWriteSerializer(many=True, min_length=1)

    def create(self, validated_data):
        line_inputs = validated_data['lines']
        name = (validated_data.get('customer_name') or '').strip()
        nit = (validated_data.get('customer_nit') or '').strip()
        notes = (validated_data.get('notes') or '').strip()

        total = Decimal('0')
        with transaction.atomic():
            quote = Quote.objects.create(
                customer_name=name,
                customer_nit=nit,
                notes=notes,
                total=Decimal('0'),
            )
            rows: list[QuoteLine] = []
            for row in line_inputs:
                item: InventoryItem = row['inventory_item']
                qty = int(row['quantity'])
                kind = row['unit_kind']
                unit_p = Decimal(str(row['line_unit_price']))
                line_total = unit_p * qty
                total += line_total
                rows.append(
                    QuoteLine(
                        quote=quote,
                        inventory_item=item,
                        quantity=qty,
                        unit_kind=kind,
                        line_unit_price=unit_p,
                    ),
                )
            QuoteLine.objects.bulk_create(rows)
            quote.total = total
            quote.save(update_fields=['total'])

        return quote
