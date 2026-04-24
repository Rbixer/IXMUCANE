"""JWT: bloqueo por vacaciones y vistas de token."""

from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from hr.vacation_sync import (
    personnel_vinculado_a_usuario,
    sync_panel_user_active_for_codigo,
    usuario_en_vacaciones,
)


class BoutiqueTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Login: mensaje claro en vacaciones; re-sincroniza is_active si el periodo ya termino."""

    default_error_messages = {
        **TokenObtainPairSerializer.default_error_messages,
        'vacation_inactive': _(
            'No puede ingresar: tiene un periodo de vacaciones activo en estas fechas.'
        ),
    }

    def validate(self, attrs: dict[str, Any]) -> dict[str, str]:
        User = get_user_model()
        username = attrs.get(self.username_field)
        password = attrs.get('password')
        user = User.objects.filter(**{self.username_field: username}).first() if username else None

        if user and user.check_password(password or ''):
            if not (user.is_superuser or user.is_staff):
                personnel = personnel_vinculado_a_usuario(user)
                if personnel is not None:
                    sync_panel_user_active_for_codigo(personnel.codigo)
                    user.refresh_from_db(fields=['is_active'])
                if usuario_en_vacaciones(user):
                    raise exceptions.AuthenticationFailed(
                        self.error_messages['vacation_inactive'],
                        'vacation_inactive',
                    )

        return super().validate(attrs)


class BoutiqueTokenRefreshSerializer(TokenRefreshSerializer):
    """No renovar acceso si entro en periodo de vacaciones."""

    default_error_messages = {
        **TokenRefreshSerializer.default_error_messages,
        'vacation_inactive': _(
            'Sesion no renovada: periodo de vacaciones activo para esta cuenta.'
        ),
    }

    def validate(self, attrs: dict[str, Any]) -> dict[str, str]:
        refresh = self.token_class(attrs['refresh'])
        user_id = refresh.payload.get(api_settings.USER_ID_CLAIM)
        if user_id:
            User = get_user_model()
            user = User.objects.filter(**{api_settings.USER_ID_FIELD: user_id}).first()
            if user and not (user.is_superuser or user.is_staff):
                personnel = personnel_vinculado_a_usuario(user)
                if personnel is not None:
                    sync_panel_user_active_for_codigo(personnel.codigo)
                    user.refresh_from_db(fields=['is_active'])
                if usuario_en_vacaciones(user):
                    raise exceptions.AuthenticationFailed(
                        self.error_messages['vacation_inactive'],
                        'vacation_inactive',
                    )
        return super().validate(attrs)


class BoutiqueTokenObtainPairView(TokenObtainPairView):
    serializer_class = BoutiqueTokenObtainPairSerializer


class BoutiqueTokenRefreshView(TokenRefreshView):
    serializer_class = BoutiqueTokenRefreshSerializer
