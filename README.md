# IXMUCANE

Panel web para **Aluminios Ixmucane**: inventario, stock, POS, proveedores, reportes y recursos humanos. Monorepo **Django + DRF** (API) y **React + Vite** (frontend).

## Requisitos

- **Python** 3.12+ (probado con Django 6)
- **Node.js** 20+ y npm

## Arranque rápido

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate

cd ../frontend
npm ci

cd ..
bash start-dev.sh
```

Por defecto el script usa **Django en `http://127.0.0.1:8001`** y **Vite en `http://localhost:5174`** (evita choques con 8000/5173). Variables opcionales:

- `BOUTIQUE_DJANGO_PORT` — puerto del `runserver`
- `BOUTIQUE_VITE_PORT` — puerto del front (también `VITE_DEV_PORT` en el front)
- `VITE_PROXY_TARGET` — URL del backend para el proxy de Vite

## Backend (variables de entorno)

| Variable | Descripción |
|----------|-------------|
| `DJANGO_SECRET_KEY` | Clave secreta en producción (obligatorio fuera de desarrollo) |
| `DJANGO_DEBUG` | `true` / `false` (por defecto `true` si no se define) |
| `DJANGO_ALLOWED_HOSTS` | Lista separada por comas, p. ej. `example.com,www.example.com` |
| `DJANGO_CORS_ORIGINS` | Orígenes CORS separados por comas (si vacío, se usan los puertos Vite por defecto) |

Ejemplo en `backend/.env.example`.

## Frontend

- API en desarrollo: rutas relativas `/api/v1` con proxy de Vite hacia el backend.
- Build de producción: `npm run build`.

## CI

GitHub Actions (`.github/workflows/ci.yml`): comprobación Django, tests y build del frontend.

## Superusuario (solo desarrollo)

```bash
cd backend && python manage.py createsuperuser
```

No uses contraseñas débiles en entornos expuestos.
