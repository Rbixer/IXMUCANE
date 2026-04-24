from django.contrib import admin

from .models import SystemVerificationGrant


@admin.register(SystemVerificationGrant)
class SystemVerificationGrantAdmin(admin.ModelAdmin):
    list_display = ('personnel', 'full_administration', 'promoted_user', 'granted_at')
    search_fields = ('personnel__codigo', 'personnel__nombre', 'personnel__apellidos', 'promoted_user__username')
