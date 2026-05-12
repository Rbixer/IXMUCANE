from django.db import models
from branches.models import Branch


class InventoryItem(models.Model):
    class Line(models.TextChoices):
        ROPA_DAMA = 'ropa-dama', 'Ropa nueva de dama'
        ROPA_CABALLERO = 'ropa-caballero', 'Ropa nueva de caballero'

    name = models.CharField(max_length=140)
    sku = models.CharField(max_length=50)
    quantity = models.PositiveIntegerField(
        default=0,
        help_text='Stock total expresado en unidades (pieza mínima).',
    )
    units_per_package = models.PositiveIntegerField(
        default=1,
        help_text='Cuántas unidades (piezas) entran en un paquete.',
    )
    packages_per_fardo = models.PositiveIntegerField(
        default=1,
        help_text='Cuántos paquetes entran en un fardo.',
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Precio de venta por unidad (pieza).',
    )
    package_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text='Precio de venta por paquete (captura directa, sin conversiones).',
    )
    fardo_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text='Precio de venta por fardo (captura directa, sin conversiones).',
    )
    cost_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text='Precio de costo por unidad (pieza).',
    )
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name='inventory_items')
    line = models.CharField(
        max_length=32,
        choices=Line.choices,
        default=Line.ROPA_DAMA,
    )
    category = models.ForeignKey(
        'ProductCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='items',
    )
    display_order = models.PositiveIntegerField(default=0)
    image = models.ImageField(
        upload_to='inventory/items/%Y/%m/',
        blank=True,
        null=True,
        help_text='Foto del producto (opcional).',
    )
    is_active = models.BooleanField(
        default=True,
        help_text='Borrado lógico: marcar False oculta el producto del catálogo pero conserva ventas históricas.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['branch', 'line', 'display_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=('branch', 'sku', 'line'),
                name='inventory_item_branch_sku_line_uniq',
            ),
        ]

    @property
    def units_per_fardo(self) -> int:
        return int(self.units_per_package) * int(self.packages_per_fardo)

    def __str__(self):
        return f'{self.name} ({self.sku})'


class ProductCategory(models.Model):
    """Categoría opcional dentro de una línea de catálogo (dama / caballero)."""

    name = models.CharField(max_length=120)
    line = models.CharField(
        max_length=32,
        choices=InventoryItem.Line.choices,
        blank=True,
        default='',
        help_text='Vacío: la categoría aplica a cualquier línea.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['line', 'name']
        constraints = [
            models.UniqueConstraint(fields=('name', 'line'), name='inventory_category_name_line_uniq'),
        ]

    def __str__(self) -> str:
        return self.name
