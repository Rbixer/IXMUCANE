import axios, { type AxiosError } from 'axios'

function axiosRequestedUrl(err: AxiosError): string {
  const c = err.config
  if (!c) return ''
  const b = (c.baseURL ?? '').replace(/\/$/, '')
  const u = (c.url ?? '').replace(/^\//, '')
  if (!u) return b
  if (!b) return `/${u}`
  return `${b}/${u}`
}

export function formatApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ERR_NETWORK') {
      return 'No hay conexion con el servidor. En dev plan B: backend en 8001 (python3 manage.py runserver 127.0.0.1:8001) o bash start-dev.sh desde la raiz del proyecto.'
    }
    const status = error.response?.status
    const data = error.response?.data
    if (typeof data === 'string') {
      const trimmed = data.trim()
      if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
        if (status === 404) {
          const tried = axiosRequestedUrl(error)
          const hint =
            tried && !tried.includes('/api/v1/')
              ? ` La peticion fue a «${tried}» (falta /api/v1 en la base del API; revise VITE_API_URL: debe terminar en /api/v1 o ser solo el origen, p. ej. http://127.0.0.1:8001).`
              : tried
                ? ` Peticion: ${tried}.`
                : ''
          return `Ruta del API no encontrada (404). Plan B: front en http://localhost:5174 y Django en 8001 (bash start-dev.sh en la raiz) o npm run dev:classic con 5173/8000. Si acabas de actualizar el proyecto, reinicie el runserver. Prueba en el navegador la misma base que usa el front: /api/v1/hr/ping/ (proxy Vite).${hint}`
        }
        return `El servidor respondio con HTML (${status ?? 'error'}) en lugar de JSON.`
      }
      return data
    }
    if (data && typeof data === 'object') {
      if ('detail' in data && data.detail != null) {
        return String(data.detail)
      }
      const parts: string[] = []
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          parts.push(`${key}: ${value.join(' ')}`)
        } else if (value && typeof value === 'object') {
          parts.push(`${key}: ${JSON.stringify(value)}`)
        } else {
          parts.push(`${key}: ${String(value)}`)
        }
      }
      if (parts.length) return parts.join('\n')
    }
    return error.message || 'Error de red'
  }
  if (error instanceof Error) return error.message
  return String(error)
}
