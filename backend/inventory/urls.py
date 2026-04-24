from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    InventoryItemViewSet,
    ProductCategoryViewSet,
    inventory_branch_summary,
    inventory_count,
    inventory_locales_count,
    inventory_locales_list,
)

router = DefaultRouter()
router.register(r'categories', ProductCategoryViewSet, basename='inventory-category')
router.register(r'', InventoryItemViewSet, basename='inventory')

urlpatterns = [
    path('count/', inventory_count, name='inventory-count'),
    path('summary-by-branch/', inventory_branch_summary, name='inventory-summary-by-branch'),
    path('locales-count/', inventory_locales_count, name='inventory-locales-count'),
    path('locales/', inventory_locales_list, name='inventory-locales-list'),
    path('', include(router.urls)),
]
