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
        path = request.path_info or ''
        try:
            response = self.get_response(request)
        except Exception:
            if path.startswith('/api/'):
                logger.exception(
                    'Excepcion no capturada en API method=%s path=%s',
                    request.method,
                    path,
                )
            raise
        if path.startswith('/api/'):
            elapsed_ms = (time.monotonic() - start) * 1000
            user_id = None
            u = getattr(request, 'user', None)
            if u is not None and getattr(u, 'is_authenticated', False):
                user_id = getattr(u, 'pk', None)
            status = getattr(response, 'status_code', '?')
            logger.info(
                'method=%s path=%s status=%s elapsed_ms=%.1f user_id=%s',
                request.method,
                path,
                status,
                elapsed_ms,
                user_id,
            )
            try:
                st = int(status)
            except (TypeError, ValueError):
                st = 0
            if st >= 500:
                snippet = ''
                content = getattr(response, 'content', None) or b''
                if isinstance(content, (bytes, bytearray)) and content:
                    snippet = bytes(content[:800]).decode('utf-8', errors='replace').replace('\n', ' ')
                logger.error(
                    'Respuesta API 5xx method=%s path=%s status=%s body_snippet=%r',
                    request.method,
                    path,
                    status,
                    snippet,
                )
        return response
