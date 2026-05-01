from django.contrib import admin

from .models import InventoryItem, ProductCategory


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'line', 'created_at')
    list_filter = ('line',)


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'sku',
        'line',
        'category',
        'branch',
        'quantity',
        'units_per_package',
        'packages_per_fardo',
        'cost_price',
        'unit_price',
        'package_price',
        'fardo_price',
        'display_order',
        'image',
    )
    list_filter = ('line', 'branch')
    search_fields = ('name', 'sku')
