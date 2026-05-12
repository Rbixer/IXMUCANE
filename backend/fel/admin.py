from django.contrib import admin

from .models import FelDocumento, FelEmisor


@admin.register(FelEmisor)
class FelEmisorAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'nit', 'ambiente', 'afiliacion_iva', 'is_default', 'is_active')
    list_filter = ('ambiente', 'afiliacion_iva', 'is_active', 'is_default')
    search_fields = ('nombre', 'nit', 'nombre_comercial')


@admin.register(FelDocumento)
class FelDocumentoAdmin(admin.ModelAdmin):
    list_display = ('sale_id', 'estado', 'serie', 'numero_autorizacion', 'fecha_certificacion', 'ambiente')
    list_filter = ('estado', 'ambiente')
    search_fields = ('serie', 'numero_autorizacion', 'sale__id')
    readonly_fields = (
        'xml_enviado', 'xml_certificado', 'respuesta_cruda',
        'fecha_certificacion', 'created_at', 'updated_at', 'intentos',
    )

    def sale_id(self, obj):  # pragma: no cover
        return obj.sale_id
    sale_id.short_description = 'Venta #'
