from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CustomerViewSet,
    QuoteViewSet,
    SaleViewSet,
    pos_ping,
    pos_sales_dashboard_summary,
    sale_factura_pdf,
    sale_factura_ticket_pdf,
)

router = DefaultRouter()
router.register(r'sales', SaleViewSet, basename='pos-sale')
router.register(r'quotes', QuoteViewSet, basename='pos-quote')
router.register(r'customers', CustomerViewSet, basename='pos-customer')

urlpatterns = [
    path('ping/', pos_ping, name='pos_ping'),
    path('sales/dashboard-summary/', pos_sales_dashboard_summary, name='pos_sales_dashboard_summary'),
    path('sales/<int:pk>/factura-pdf/', sale_factura_pdf, name='pos_sale_factura_pdf'),
    path('sales/<int:pk>/factura-ticket-pdf/', sale_factura_ticket_pdf, name='pos_sale_factura_ticket_pdf'),
    path('', include(router.urls)),
]
