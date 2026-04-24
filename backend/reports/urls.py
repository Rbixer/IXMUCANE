from django.urls import path

from .views import inventory_report, pos_sales_report

urlpatterns = [
    path('inventario/<str:salida>/', inventory_report, name='reports-inventory-file'),
    path('inventario/', inventory_report, name='reports-inventory'),
    path('sistema-pos/<str:salida>/', pos_sales_report, name='reports-pos-file'),
    path('sistema-pos/', pos_sales_report, name='reports-pos'),
]
