from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    InventoryItemViewSet,
    ProductCategoryViewSet,
    inventory_branch_summary,
    inventory_count,
    inventory_etiquetas_lote_pdf,
    inventory_item_barcode_png,
    inventory_item_etiqueta_pdf,
    inventory_locales_count,
    inventory_locales_list,
    inventory_transfer_by_branch,
)

router = DefaultRouter()
router.register(r'categories', ProductCategoryViewSet, basename='inventory-category')
router.register(r'', InventoryItemViewSet, basename='inventory')

urlpatterns = [
    path('count/', inventory_count, name='inventory-count'),
    path('summary-by-branch/', inventory_branch_summary, name='inventory-summary-by-branch'),
    path('locales-count/', inventory_locales_count, name='inventory-locales-count'),
    path('locales/', inventory_locales_list, name='inventory-locales-list'),
    path('transfer-by-branch/', inventory_transfer_by_branch, name='inventory-transfer-by-branch'),
    path('etiquetas-lote-pdf/', inventory_etiquetas_lote_pdf, name='inventory-etiquetas-lote-pdf'),
    path('items/<int:pk>/barcode.png', inventory_item_barcode_png, name='inventory-item-barcode-png'),
    path('items/<int:pk>/etiqueta-pdf/', inventory_item_etiqueta_pdf, name='inventory-item-etiqueta-pdf'),
    path('', include(router.urls)),
]
