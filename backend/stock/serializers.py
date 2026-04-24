from rest_framework import serializers
from .models import StockMovement


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='inventory_item.name', read_only=True)
    existencia_actual = serializers.IntegerField(source='inventory_item.quantity', read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            'id',
            'inventory_item',
            'product_name',
            'existencia_actual',
            'movement_type',
            'quantity',
            'note',
            'created_at',
        ]
