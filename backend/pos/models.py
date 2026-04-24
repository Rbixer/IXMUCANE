from django.db import models


class Sale(models.Model):
    """Venta POS (cabecera). El detalle va en SaleLine."""

    class Payment(models.TextChoices):
        CASH = 'cash', 'Efectivo'
        CARD = 'card', 'Tarjeta'
        OTHER = 'other', 'Otro'

    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='pos_sales',
    )
    payment_method = models.CharField(
        max_length=16,
        choices=Payment.choices,
        default=Payment.CASH,
    )
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
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
