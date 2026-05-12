from django.db import models


class Supplier(models.Model):
    name = models.CharField('Nombre', max_length=200, blank=True, default='')
    contact = models.CharField('Contacto', max_length=200, blank=True, default='')
    nit = models.CharField('NIT', max_length=32, blank=True, default='')
    razon_social = models.CharField('Razón social', max_length=200, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(
        default=True,
        help_text='Borrado lógico: marcar False oculta el proveedor de las listas pero conserva órdenes históricas.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        for label in (self.name, self.razon_social, self.nit):
            if label and str(label).strip():
                return str(label).strip()
        return f'Proveedor #{self.pk}'


class PurchaseOrder(models.Model):
    """Recepcion inmediata: al crear la orden se incrementa stock y se registra movimiento IN."""

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='purchase_orders')
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT, related_name='purchase_orders')
    reference = models.CharField(max_length=120, blank=True, default='')
    is_active = models.BooleanField(
        default=True,
        help_text='Borrado lógico: oculta la orden del listado pero conserva el histórico de stock.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'OC #{self.pk} {self.supplier.name}'


class PurchaseLine(models.Model):
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='lines')
    inventory_item = models.ForeignKey(
        'inventory.InventoryItem',
        on_delete=models.PROTECT,
        related_name='purchase_lines',
    )
    quantity = models.PositiveIntegerField()

    class Meta:
        ordering = ['id']

    def __str__(self) -> str:
        return f'{self.inventory_item.sku} +{self.quantity}'
