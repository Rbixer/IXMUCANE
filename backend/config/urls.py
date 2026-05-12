"""
URL configuration for config project.

Las rutas de RR.HH. estan registradas aqui de forma explicita para evitar 404
si `include('hr.urls')` no cargara en algun entorno.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def hr_ping(_request):
    """Comprueba en navegador: GET /api/v1/hr/ping/ debe devolver JSON (no 404)."""
    return JsonResponse({'module': 'hr', 'ok': True})


def api_root(request):
    """Raiz del servidor API (GET /). El panel en dev suele ser Vite plan B: 5174 (clásico 5173)."""
    return JsonResponse(
        {
            'service': 'boutique-api',
            'ok': True,
            'frontend_dev': 'http://localhost:5174',
            'api_base': request.build_absolute_uri('/api/v1/'),
            'paths': [
                '/api/v1/auth/',
                '/api/v1/auth/users/',
                '/api/v1/auth/verification-grants/',
                '/api/v1/auth/panel-worker-users/',
                '/api/v1/auth/panel-worker-users/<id>/',
                '/api/v1/inventory/locales/',
                '/api/v1/inventory/locales-count/',
                '/api/v1/inventory/',
                '/api/v1/stock/',
                '/api/v1/hr/ping/',
                '/api/v1/hr/',
                '/api/v1/hr/vacaciones/',
                '/api/v1/pos/ping/',
                '/api/v1/pos/',
                '/api/v1/suppliers/',
                '/api/v1/reports/',
                '/admin/',
            ],
        }
    )


admin.site.site_header = 'Aluminios Ixmucane'
admin.site.site_title = 'Aluminios Ixmucane admin'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('authentication.urls')),
    path('api/v1/inventory/', include('inventory.urls')),
    path('api/v1/stock/', include('stock.urls')),
    path('api/v1/hr/ping/', hr_ping),
    path('api/v1/hr/', include('hr.urls')),
    path('api/v1/pos/', include('pos.urls')),
    path('api/v1/suppliers/', include('suppliers.urls')),
    path('api/v1/reports/', include('reports.urls')),
    path('api/v1/fel/', include('fel.urls')),
    path('', api_root),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
