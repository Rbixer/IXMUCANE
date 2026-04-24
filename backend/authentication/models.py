from django.conf import settings
from django.db import models


class PanelUserModulePermission(models.Model):
    """Módulos del panel habilitados para una cuenta no staff (vista Ingresar)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='panel_module_permission',
    )
    modules = models.JSONField(default=list)

    class Meta:
        verbose_name = 'Permisos de modulos (panel)'
        verbose_name_plural = 'Permisos de modulos (panel)'

    def __str__(self):
        return f'{self.user_id}: {self.modules}'


class SystemVerificationGrant(models.Model):
    """Trabajador (RR.HH.) con permiso para verificar / auditar el sistema."""

    personnel = models.OneToOneField(
        'hr.PersonnelRecord',
        on_delete=models.CASCADE,
        related_name='system_verification_grant',
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    full_administration = models.BooleanField(
        default=False,
        help_text='Si es verdadero, la cuenta enlazada recibio is_staff/is_superuser al otorgar este permiso.',
    )
    promoted_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verification_grant_promotions',
        help_text='Usuario al que se elevo a staff al crear este permiso (se revierte al revocar).',
    )

    class Meta:
        verbose_name = 'Permiso de verificacion del sistema'
        verbose_name_plural = 'Permisos de verificacion del sistema'

    def __str__(self):
        return f'Verificador: {self.personnel}'
