from rest_framework import serializers

from .models import InventoryItem, ProductCategory
from .unit_hierarchy import split_stock_hierarchy

_MAX_IMAGE_BYTES = 5 * 1024 * 1024


class NullableCategoryPKField(serializers.PrimaryKeyRelatedField):
    """Acepta cadena vacía en multipart para limpiar la categoría."""

    def to_internal_value(self, data):
        if data in ('', None):
            return None
        return super().to_internal_value(data)


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ['id', 'name', 'line', 'created_at']
        read_only_fields = ['id', 'created_at']


class InventoryItemSerializer(serializers.ModelSerializer):
    """`image` solo escritura (multipart); `image_url` lectura para el panel."""

    image = serializers.ImageField(required=False, allow_null=True, write_only=True)
    image_url = serializers.SerializerMethodField(read_only=True)
    category_name = serializers.SerializerMethodField(read_only=True)
    category = NullableCategoryPKField(
        queryset=ProductCategory.objects.all(),
        required=False,
        allow_null=True,
    )
    hierarchy = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = InventoryItem
        # Sin validators por defecto: el UniqueTogetherValidator de DRF corre antes de `validate()`
        # y solo devuelve non_field_errors genéricos. La unicidad (branch, sku, line) se comprueba en validate().
        validators = []
        fields = [
            'id',
            'name',
            'sku',
            'quantity',
            'units_per_package',
            'packages_per_fardo',
            'hierarchy',
            'unit_price',
            'cost_price',
            'branch',
            'line',
            'category',
            'category_name',
            'display_order',
            'image',
            'image_url',
            'created_at',
        ]
        read_only_fields = ['id', 'image_url', 'category_name', 'hierarchy', 'created_at']

    def get_image_url(self, obj):
        if not obj.image:
            return ''
        request = self.context.get('request')
        url = obj.image.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def get_category_name(self, obj):
        if obj.category_id is None:
            return ''
        return obj.category.name

    def get_hierarchy(self, obj: InventoryItem):
        f, p, u = split_stock_hierarchy(obj.quantity, obj.units_per_package, obj.packages_per_fardo)
        return {
            'fardos': f,
            'paquetes': p,
            'unidades': u,
            'total_unidades': obj.quantity,
        }

    def validate(self, attrs):
        upp = attrs.get('units_per_package', getattr(self.instance, 'units_per_package', 1) if self.instance else 1)
        ppf = attrs.get('packages_per_fardo', getattr(self.instance, 'packages_per_fardo', 1) if self.instance else 1)
        if int(upp or 0) < 1:
            raise serializers.ValidationError({'units_per_package': 'Debe ser al menos 1.'})
        if int(ppf or 0) < 1:
            raise serializers.ValidationError({'packages_per_fardo': 'Debe ser al menos 1.'})

        inst = self.instance
        branch = attrs.get('branch', getattr(inst, 'branch', None) if inst else None)
        sku_raw = attrs.get('sku', getattr(inst, 'sku', None) if inst else None)
        line = attrs.get('line', getattr(inst, 'line', None) if inst else None)

        if branch is None or sku_raw is None or line in (None, ''):
            return attrs

        sku = sku_raw.strip() if isinstance(sku_raw, str) else str(sku_raw)
        if not sku:
            return attrs

        branch_id = branch.pk if hasattr(branch, 'pk') else int(branch)

        dup = InventoryItem.objects.filter(branch_id=branch_id, sku=sku, line=line)
        if inst is not None:
            dup = dup.exclude(pk=inst.pk)
        if dup.exists():
            raise serializers.ValidationError(
                {
                    'sku': (
                        'Ya existe otro producto con este SKU en la misma sucursal y la misma línea de catálogo '
                        '(dama / caballero). Use un SKU distinto, otra sucursal u otra línea.'
                    ),
                }
            )

        if isinstance(sku_raw, str):
            attrs['sku'] = sku

        return attrs

    def validate_image(self, value):
        if value is None:
            return value
        if value.size > _MAX_IMAGE_BYTES:
            raise serializers.ValidationError('La imagen no debe superar 5 MB.')
        return value

    def update(self, instance, validated_data):
        new_image = validated_data.get('image', serializers.empty)
        if new_image is not serializers.empty and new_image is not None and instance.image:
            instance.image.delete(save=False)
        return super().update(instance, validated_data)
