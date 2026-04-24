"""Sincroniza acceso al panel con permisos de tipo Vacaciones (no Descansos)."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import PersonnelRecord, VacationLeave


def codigo_en_vacaciones_activas(codigo: str) -> bool:
    """True si hoy cae dentro de un periodo Vacaciones para ese codigo de empleado."""
    c = (codigo or '').strip()
    if not c:
        return False
    today = timezone.localdate()
    return VacationLeave.objects.filter(
        codigo_empleado__iexact=c,
        tipo_periodo='Vacaciones',
        fecha_salida__lte=today,
        fecha_regreso__gte=today,
    ).exists()


def personnel_vinculado_a_usuario(user):
    if not user or not getattr(user, 'pk', None):
        return None
    return PersonnelRecord.objects.filter(panel_user_id=user.pk).first()


def usuario_en_vacaciones(user) -> bool:
    """Usuario de panel enlazado a personal y con vacaciones activas hoy."""
    if not user or user.is_superuser or user.is_staff:
        return False
    personnel = personnel_vinculado_a_usuario(user)
    if personnel is None:
        return False
    return codigo_en_vacaciones_activas(personnel.codigo)


def sync_panel_user_active_for_codigo(codigo: str) -> None:
    """
    Ajusta is_active del usuario de panel segun vacaciones del codigo hoy.
    Solo afecta cuentas no staff/superuser enlazadas a ese codigo.
    """
    c = (codigo or '').strip()
    if not c:
        return
    bloqueado = codigo_en_vacaciones_activas(c)
    User = get_user_model()
    for p in PersonnelRecord.objects.filter(codigo__iexact=c).select_related('panel_user'):
        u = p.panel_user
        if u is None:
            continue
        if u.is_superuser or u.is_staff:
            continue
        if bloqueado and u.is_active:
            u.is_active = False
            u.save(update_fields=['is_active'])
        elif not bloqueado and not u.is_active:
            u.is_active = True
            u.save(update_fields=['is_active'])


def sync_panel_users_for_vacation_leave(instance: VacationLeave | None, old_codigo: str | None = None) -> None:
    """Tras crear/editar/eliminar permiso: actualizar cuentas por codigo afectado."""
    codigos: set[str] = set()
    if old_codigo:
        codigos.add(old_codigo.strip())
    if instance is not None:
        codigos.add((instance.codigo_empleado or '').strip())
    for c in codigos:
        if c:
            sync_panel_user_active_for_codigo(c)
