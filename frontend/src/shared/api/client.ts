import axios, { type InternalAxiosRequestConfig } from 'axios'
import { authStorage } from '../lib/auth'
import { formatApiError } from '../lib/apiError'

/**
 * Base del API. Por defecto `/api/v1` (mismo origen que el front; plan B dev: http://localhost:5174).
 * Vite reenvia `/api` al backend (plan B: 8001; clásico: 8000) — evita CORS y 404 por URL cruzada.
 * Opcional: `VITE_API_URL` en `.env` para otro host (p. ej. despliegue).
 *
 * Normaliza errores frecuentes:
 * - Origen solo (`http://127.0.0.1:8001`) → añade `/api/v1`.
 * - `.../api` o `.../api/` sin `v1` → `.../api/v1` (si no, Django devuelve 404 HTML en rutas reales).
 * - Relativo `/api` → `/api/v1`.
 */
export function getApiBaseURL(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  if (!raw) return '/api/v1'

  const base = raw.replace(/\/$/, '')
  if (/\/api\/v1$/i.test(base)) return base

  try {
    const u = new URL(base)
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/'
    if (path === '/' || path === '') {
      return `${u.origin}/api/v1`
    }
    if (/^\/api$/i.test(path)) {
      return `${u.origin}/api/v1`
    }
  } catch {
    const rel = raw.replace(/\/$/, '')
    if (rel === '/api' || rel.toLowerCase() === '/api/') return '/api/v1'
  }

  return base
}

export const api = axios.create({
  baseURL: getApiBaseURL(),
})

api.interceptors.request.use((config) => {
  const token = authStorage.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** Una sola renovacion en curso si llegan varios 401 a la vez */
let refreshPromise: Promise<string> | null = null

function requestUrl(config: InternalAxiosRequestConfig) {
  const base = config.baseURL ?? ''
  const path = config.url ?? ''
  if (path.startsWith('http')) return path
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function refreshUrl() {
  return `${getApiBaseURL()}/auth/token/refresh/`
}

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refresh = authStorage.getRefreshToken()
      if (!refresh) {
        throw new Error('NO_REFRESH')
      }
      const { data } = await axios.post<{ access: string }>(refreshUrl(), {
        refresh,
      })
      const access = data.access?.trim()
      if (!access) throw new Error('NO_ACCESS')
      authStorage.setToken(access)
      return access
    })().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(new Error(formatApiError(error)))
    }

    const cfg = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const status = error.response?.status
    const url = requestUrl(cfg)
    const isLogin = url.includes('/auth/token/') && !url.includes('refresh')
    const isRefresh = url.includes('/auth/token/refresh/')

    if (status === 401 && !cfg._retry && !isLogin && !isRefresh) {
      cfg._retry = true
      try {
        const access = await refreshAccessToken()
        cfg.headers = cfg.headers ?? {}
        cfg.headers.Authorization = `Bearer ${access}`
        return api.request(cfg)
      } catch {
        authStorage.clear()
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign('/login?motivo=sesion')
        }
        return Promise.reject(
          new Error('Tu sesion expiro o el token no es valido. Inicia sesion de nuevo.'),
        )
      }
    }

    if (status === 401 && isRefresh) {
      authStorage.clear()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?motivo=sesion')
      }
    }

    if (import.meta.env.DEV && typeof console !== 'undefined' && console.warn) {
      const msg = formatApiError(error)
      console.warn(`[boutique-api] ${status ?? '?'} ${url}`, msg)
    }
    return Promise.reject(new Error(formatApiError(error)))
  },
)
