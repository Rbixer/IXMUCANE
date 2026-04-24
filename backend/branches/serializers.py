from rest_framework import serializers
from .models import Branch


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ['id', 'name', 'city', 'address', 'maps_url', 'manager', 'is_active', 'created_at']
        extra_kwargs = {
            'created_at': {'read_only': True},
            'is_active': {'default': True},
        }
