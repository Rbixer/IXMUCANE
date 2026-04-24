import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Plan B (menos choque con procesos viejos): 5174 + Django 8001. Override: VITE_DEV_PORT, VITE_PROXY_TARGET */
function devServerFromEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')
  const port = Number(env.VITE_DEV_PORT || 5174)
  const proxyTarget = (env.VITE_PROXY_TARGET || 'http://127.0.0.1:8001').replace(/\/$/, '')
  return {
    port: Number.isFinite(port) && port > 0 ? port : 5174,
    /** Si el puerto está ocupado, Vite prueba el siguiente (evita bloqueo tipo sandbox). */
    strictPort: false,
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true, secure: false },
      '/media': { target: proxyTarget, changeOrigin: true, secure: false },
    },
  }
}

/**
 * En desarrollo, Firefox/Chrome intentan cargar *.js.map de `node_modules/.vite/deps/`.
 * Si la petición falla (404/red), DevTools muestra "Error en el mapeo fuente / NetworkError".
 * Este middleware responde un source map vacío pero válido para esas rutas.
 */
function depSourcemapShimPlugin(): Plugin {
  return {
    name: 'dep-sourcemap-shim',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      const shim: Connect.NextHandleFunction = (req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? ''
        if (url.includes('/node_modules/.vite/deps/') && url.endsWith('.map')) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(
            JSON.stringify({
              version: 3,
              file: 'prebundle.js',
              /** Debe ser no vacío: DevTools (Firefox/Chrome) advierte si `sources` está vacío. */
              sources: ['<vite-prebundle>'],
              sourcesContent: [''],
              names: [],
              mappings: 'AAAA',
            }),
          )
          return
        }
        next()
      }
      const stack = server.middlewares.stack as { route: string; handle: Connect.NextHandleFunction }[]
      stack.unshift({ route: '', handle: shim })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [depSourcemapShimPlugin(), react()],
  /** Menos ruido en consola por CSS en modo dev. */
  css: {
    devSourcemap: false,
  },
  server: devServerFromEnv(mode),
  preview: {
    proxy: devServerFromEnv(mode).proxy,
  },
}))
