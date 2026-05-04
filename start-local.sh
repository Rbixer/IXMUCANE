#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DJANGO_PORT="${BOUTIQUE_DJANGO_PORT:-8050}"
VITE_PORT="${BOUTIQUE_VITE_PORT:-5200}"

STARTED_BACKEND=0
DJ_PID=""

if curl -sf "http://127.0.0.1:${DJANGO_PORT}/api/v1/hr/ping/" >/dev/null 2>&1; then
  echo "[start-local] Backend ya estaba activo en 127.0.0.1:${DJANGO_PORT}"
else
  echo "[start-local] Iniciando backend en 127.0.0.1:${DJANGO_PORT}"
  (
    cd "$ROOT/backend"
    python3 manage.py runserver "127.0.0.1:${DJANGO_PORT}"
  ) &
  DJ_PID=$!
  STARTED_BACKEND=1
fi

cleanup() {
  if [ "$STARTED_BACKEND" -eq 1 ] && [ -n "$DJ_PID" ]; then
    kill "$DJ_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "[start-local] Esperando backend..."
for _ in {1..60}; do
  if curl -sf "http://127.0.0.1:${DJANGO_PORT}/api/v1/hr/ping/" >/dev/null 2>&1; then
    echo "[start-local] Backend OK"
    break
  fi
  if ! kill -0 "$DJ_PID" 2>/dev/null; then
    echo "[start-local] Backend no pudo iniciar (puerto ocupado o error)." >&2
    exit 1
  fi
  sleep 0.25
done

echo "[start-local] Iniciando frontend en 127.0.0.1:${VITE_PORT}"
cd "$ROOT/frontend"
export VITE_DEV_PORT="$VITE_PORT"
export VITE_PROXY_TARGET="http://127.0.0.1:${DJANGO_PORT}"
npm run dev -- --host 127.0.0.1 --port "$VITE_PORT"
