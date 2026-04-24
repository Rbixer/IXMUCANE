"""
Vacía inventario y ventas/órdenes que lo referencian, y crea dos ítems de ejemplo (tienda de variedades).

Uso: python manage.py reset_inventario_variedades --yes
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from branches.models import Branch
from inventory.models import InventoryItem, ProductCategory
from pos.models import Sale
from stock.models import StockMovement
from suppliers.models import PurchaseOrder


class Command(BaseCommand):
    help = 'Elimina todo el inventario (y ventas/órdenes POS que lo bloquean) y crea ejemplos: vasos y servilletas.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Confirmación obligatoria para ejecutar el borrado.',
        )

    def handle(self, *args, **options):
        if not options['yes']:
            self.stderr.write(self.style.WARNING('No se hizo nada. Vuelva a ejecutar con --yes para confirmar.'))
            return

        with transaction.atomic():
            deleted_sales = Sale.objects.all().delete()
            deleted_po = PurchaseOrder.objects.all().delete()
            deleted_items = InventoryItem.objects.all().delete()

        self.stdout.write(
            self.style.SUCCESS(
                f'Ventas (cabeceras y líneas en cascada): {deleted_sales[0]}, '
                f'órdenes de compra: {deleted_po[0]}, ítems de inventario: {deleted_items[0]}.'
            )
        )

        branch = Branch.objects.order_by('id').first()
        if branch is None:
            self.stderr.write(self.style.ERROR('No hay ningún punto de inventario (Branch). Cree uno en Django admin.'))
            return

        cat, _ = ProductCategory.objects.get_or_create(
            name='Variedades del hogar',
            line='',
            defaults={},
        )

        with transaction.atomic():
            vaso = InventoryItem.objects.create(
                name='Juego de vasos',
                sku='VAR-VASOS-01',
                quantity=48,
                units_per_package=6,
                packages_per_fardo=2,
                unit_price=Decimal('85.00'),
                cost_price=Decimal('42.50'),
                branch=branch,
                line=InventoryItem.Line.ROPA_DAMA,
                category=cat,
                display_order=1,
            )
            StockMovement.objects.create(
                inventory_item=vaso,
                movement_type=StockMovement.MovementType.IN,
                quantity=48,
                note='Alta inicial — ejemplo variedades',
            )

            serv = InventoryItem.objects.create(
                name='Paquete de servilletas',
                sku='VAR-SERV-01',
                quantity=120,
                units_per_package=10,
                packages_per_fardo=1,
                unit_price=Decimal('18.00'),
                cost_price=Decimal('9.00'),
                branch=branch,
                line=InventoryItem.Line.ROPA_DAMA,
                category=cat,
                display_order=2,
            )
            StockMovement.objects.create(
                inventory_item=serv,
                movement_type=StockMovement.MovementType.IN,
                quantity=120,
                note='Alta inicial — ejemplo variedades',
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Creados en «{branch.name}»: «{vaso.name}» (SKU {vaso.sku}), «{serv.name}» (SKU {serv.sku}). '
                f'Categoría: «{cat.name}».'
            )
        )
