"""Autenticacion JWT con comprobacion de vacaciones (evitar import circular con urls)."""

from __future__ import annotations

from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import Token

from hr.vacation_sync import usuario_en_vacaciones


class VacationAwareJWTAuthentication(JWTAuthentication):
    """Rechaza el token si hoy el usuario de panel tiene vacaciones tipo Vacaciones."""

    def get_user(self, validated_token: Token):
        user = super().get_user(validated_token)
        if user is not None and usuario_en_vacaciones(user):
            raise exceptions.AuthenticationFailed(
                _('La sesion no es valida: periodo de vacaciones activo.'),
                code='vacation_inactive',
            )
        return user
