from django.contrib import admin

from .models import Branch


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ('name', 'city', 'manager', 'is_active', 'maps_url')
    search_fields = ('name', 'city', 'address', 'manager')
