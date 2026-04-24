#!/usr/bin/env bash
# Plan B por defecto: Django 8001 + Vite 5174 (menos choque con instancias colgadas en 8000/5173).
# Clásico: BOUTIQUE_DJANGO_PORT=8000 BOUTIQUE_VITE_PORT=5173 bash start-dev.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DJANGO_PORT="${BOUTIQUE_DJANGO_PORT:-8001}"
VITE_PORT="${BOUTIQUE_VITE_PORT:-5174}"
cd "$ROOT/backend"
python3 manage.py runserver "127.0.0.1:${DJANGO_PORT}" &
DJ_PID=$!
cleanup() { kill "$DJ_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

wait_for_django() {
  local i=0
  while [ "$i" -lt 40 ]; do
    if curl -sf "http://127.0.0.1:${DJANGO_PORT}/api/v1/hr/ping/" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$DJ_PID" 2>/dev/null; then
      echo "[start-dev] Django no arranco (¿puerto ${DJANGO_PORT} ocupado?). Cierre el proceso viejo o use: BOUTIQUE_DJANGO_PORT=8020 bash start-dev.sh" >&2
      return 1
    fi
    i=$((i + 1))
    sleep 0.25
  done
  echo "[start-dev] Timeout esperando API en 127.0.0.1:${DJANGO_PORT}." >&2
  return 1
}

if ! wait_for_django; then
  cleanup
  exit 1
fi

echo "[start-dev] Django OK en http://127.0.0.1:${DJANGO_PORT}/ — prueba API: /api/v1/hr/ping/"
echo "[start-dev] Arrancando Vite (puerto ${VITE_PORT}; si esta ocupado, Vite puede usar el siguiente). Proxy /api -> ${DJANGO_PORT}"

cd "$ROOT/frontend"
export VITE_DEV_PORT="$VITE_PORT"
export VITE_PROXY_TARGET="http://127.0.0.1:${DJANGO_PORT}"
npm run dev
# EXIT limpia Django al cerrar Vite (Ctrl+C o salida normal).
