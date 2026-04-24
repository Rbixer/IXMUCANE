"""Middleware ligero: registra peticiones al API (no contraseñas ni cuerpos)."""

from __future__ import annotations

import logging
import time

logger = logging.getLogger('boutique.api')


class ApiRequestLogMiddleware:
    """Una linea por respuesta para /api/*: metodo, ruta, status, duracion, usuario (si hay)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.monotonic()
        response = self.get_response(request)
        path = request.path_info or ''
        if path.startswith('/api/'):
            elapsed_ms = (time.monotonic() - start) * 1000
            user_id = None
            u = getattr(request, 'user', None)
            if u is not None and getattr(u, 'is_authenticated', False):
                user_id = getattr(u, 'pk', None)
            logger.info(
                'method=%s path=%s status=%s elapsed_ms=%.1f user_id=%s',
                request.method,
                path,
                getattr(response, 'status_code', '?'),
                elapsed_ms,
                user_id,
            )
        return response
