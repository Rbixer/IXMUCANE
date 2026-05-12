from django.db import models


class Customer(models.Model):
    """Cliente POS para autocompletado en ventas/pedidos."""

    name = models.CharField(max_length=200)
    nit = models.CharField(max_length=80, blank=True, default='')
    phone = models.CharField(max_length=40, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    address = models.TextField(blank=True, default='')
    is_active = models.BooleanField(
        default=True,
        help_text='Soft-delete: si está en False el cliente queda oculto del listado.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self) -> str:
        return self.name


class Quote(models.Model):
    """Cotización POS (sin descuento de inventario). Número = pk autoincrementable."""

    customer_name = models.CharField(max_length=200, blank=True, default='')
    customer_nit = models.CharField(max_length=80, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Cotización #{self.pk} {self.total}'


class QuoteLine(models.Model):
    class UnitKind(models.TextChoices):
        UNIT = 'unit', 'Unidad'
        PACKAGE = 'package', 'Paquete'
        FARDO = 'fardo', 'Fardo'

    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name='lines')
    inventory_item = models.ForeignKey(
        'inventory.InventoryItem',
        on_delete=models.PROTECT,
        related_name='quote_lines',
    )
    quantity = models.PositiveIntegerField()
    unit_kind = models.CharField(
        max_length=16,
        choices=UnitKind.choices,
        default=UnitKind.UNIT,
    )
    line_unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ['id']

    def __str__(self) -> str:
        return f'{self.inventory_item.sku} x{self.quantity}'


class Sale(models.Model):
    """Venta POS (cabecera). El detalle va en SaleLine."""

    class Payment(models.TextChoices):
        CASH = 'cash', 'Efectivo'
        CARD = 'card', 'Tarjeta'
        OTHER = 'other', 'Otro'

    class PaymentStatus(models.TextChoices):
        PAID    = 'paid',    'Pagado'
        CREDIT  = 'credit',  'Crédito'
        PENDING = 'pending', 'Pago pendiente'

    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='pos_sales',
    )
    customer = models.ForeignKey(
        'pos.Customer',
        on_delete=models.PROTECT,
        related_name='sales',
        null=True,
        blank=True,
    )
    customer_name = models.CharField(max_length=200, blank=True, default='')
    customer_nit = models.CharField(
        max_length=80,
        blank=True,
        default='',
        help_text='NIT del receptor para FEL (CF si está vacío).',
    )
    customer_phone = models.CharField(max_length=40, blank=True, default='')
    customer_email = models.EmailField(blank=True, default='')
    customer_address = models.TextField(blank=True, default='')
    payment_method = models.CharField(
        max_length=16,
        choices=Payment.choices,
        default=Payment.CASH,
    )
    payment_status = models.CharField(
        max_length=16,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PAID,
    )
    credit_days = models.PositiveSmallIntegerField(
        default=0,
        help_text='Días de plazo para ventas a crédito (0 = sin plazo definido).',
    )
    credit_note = models.TextField(blank=True, default='')
    discount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text='Descuento fijo aplicado al total (en quetzales).',
    )
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='Suma de abonos recibidos (crédito/pendiente). Si alcanza el total, la venta queda pagada.',
    )
    is_envio = models.BooleanField(
        default=False,
        help_text=(
            'Si está activo la venta se procesa como ENVÍO/recibo y NO se '
            'certifica en FEL automáticamente.'
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Venta #{self.pk} {self.branch.name} {self.total}'


class SaleLine(models.Model):
    """Linea de venta con snapshot de precio."""

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='lines')
    inventory_item = models.ForeignKey(
        'inventory.InventoryItem',
        on_delete=models.PROTECT,
        related_name='sale_lines',
    )
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ['id']

    def __str__(self) -> str:
        return f'{self.inventory_item.sku} x{self.quantity}'
