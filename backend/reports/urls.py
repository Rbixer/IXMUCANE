from django.urls import path

from .views import (
    cobros_report,
    ganancias_report,
    inventory_report,
    pos_sales_report,
    suppliers_report,
)

urlpatterns = [
    path('inventario/<str:salida>/', inventory_report, name='reports-inventory-file'),
    path('inventario/', inventory_report, name='reports-inventory'),
    path('sistema-pos/<str:salida>/', pos_sales_report, name='reports-pos-file'),
    path('sistema-pos/', pos_sales_report, name='reports-pos'),
    path('proveedores/<str:salida>/', suppliers_report, name='reports-suppliers-file'),
    path('proveedores/', suppliers_report, name='reports-suppliers'),
    path('cobros/<str:salida>/', cobros_report, name='reports-cobros-file'),
    path('cobros/', cobros_report, name='reports-cobros'),
    path('ganancias/<str:salida>/', ganancias_report, name='reports-ganancias-file'),
    path('ganancias/', ganancias_report, name='reports-ganancias'),
]
