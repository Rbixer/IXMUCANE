from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import FelDocumentoViewSet, FelEmisorViewSet, consultar_nit

router = DefaultRouter()
router.register(r'emisores', FelEmisorViewSet, basename='fel-emisor')
router.register(r'documentos', FelDocumentoViewSet, basename='fel-documento')

urlpatterns = router.urls + [
    path('consulta-nit/', consultar_nit, name='fel-consulta-nit'),
]
