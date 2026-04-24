from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import StockMovementViewSet, stock_count

router = DefaultRouter()
router.register(r'', StockMovementViewSet, basename='stock')

urlpatterns = [
    path('count/', stock_count, name='stock-count'),
    path('', include(router.urls)),
]
