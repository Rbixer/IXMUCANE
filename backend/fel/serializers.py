from rest_framework import serializers

from .models import FelDocumento, FelEmisor


class FelEmisorSerializer(serializers.ModelSerializer):
    class Meta:
        model = FelEmisor
        fields = [
            'id', 'nombre', 'nit', 'nombre_comercial', 'codigo_establecimiento',
            'afiliacion_iva', 'direccion', 'codigo_postal', 'municipio',
            'departamento', 'pais', 'ambiente', 'is_default', 'is_active',
        ]
        read_only_fields = ['id']


class FelDocumentoSerializer(serializers.ModelSerializer):
    sale_id = serializers.IntegerField(source='sale.pk', read_only=True)
    emisor_nombre = serializers.CharField(source='emisor.nombre', read_only=True)

    class Meta:
        model = FelDocumento
        fields = [
            'id', 'sale_id', 'emisor', 'emisor_nombre', 'estado', 'ambiente',
            'serie', 'numero_autorizacion', 'fecha_certificacion',
            'error_mensaje', 'intentos', 'created_at', 'updated_at',
        ]
        read_only_fields = fields
