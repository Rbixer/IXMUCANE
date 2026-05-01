import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, ArrowRight, Lock, User } from 'lucide-react'
import { fetchProfile, loginRequest } from './auth.service'
import { authStorage } from '../../shared/lib/auth'
import { setPanelBranchIdInStorage } from '../../shared/lib/panelBranch'
import { setPanelModulesDesdePerfil, setSesionTrasLogin } from '../../shared/lib/accesoSesion'
import { notifyError, notifyInfo } from '../../shared/lib/notify'

const SESION_MSG_KEY = 'boutique_login_motivo_sesion_visto'

const loginSchema = z.object({
  username: z.string().min(1, 'Usuario requerido'),
  password: z.string().min(1, 'Contraseña requerida'),
})
type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    if (searchParams.get('motivo') !== 'sesion') return
    const stripMotivo = () => {
      const next = new URLSearchParams(searchParams.toString())
      next.delete('motivo')
      setSearchParams(next, { replace: true })
    }
    const msg = 'Tu sesión expiró o el token ya no es válido. Inicia sesión de nuevo para continuar.'
    if (sessionStorage.getItem(SESION_MSG_KEY) === '1') { stripMotivo(); return }
    sessionStorage.setItem(SESION_MSG_KEY, '1')
    stripMotivo()
    setError(msg)
    notifyInfo(msg)
  }, [searchParams, setSearchParams])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setError('')
    try {
      const response = await loginRequest(values.username, values.password)
      authStorage.setTokens(response.access, response.refresh)
      let profile
      try {
        profile = await fetchProfile()
      } catch {
        authStorage.clear()
        const msg = 'No se pudo verificar el perfil. Compruebe la conexión e intente de nuevo.'
        setError(msg); notifyError(msg); return
      }
      const puedeAdmin = Boolean(profile.is_staff || profile.is_superuser)
      setSesionTrasLogin(puedeAdmin ? 'admin' : 'panel', puedeAdmin)
      setPanelModulesDesdePerfil(puedeAdmin ? null : profile.panel_allowed_modules)
      setPanelBranchIdInStorage(null)
      sessionStorage.removeItem('boutique_resumen_admin')
      void queryClient.removeQueries({ queryKey: ['auth', 'profile'] })
      sessionStorage.removeItem(SESION_MSG_KEY)
      navigate('/dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Credenciales inválidas. Intente de nuevo.'
      setError(msg); notifyError(msg)
    }
  })

  return (
    <main
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(ellipse at 25% 25%, rgba(220,38,38,0.22) 0%, transparent 52%),' +
          'radial-gradient(ellipse at 78% 75%, rgba(245,158,11,0.14) 0%, transparent 50%),' +
          'linear-gradient(160deg, #08090F 0%, #0E1020 55%, #130608 100%)',
      }}
    >
      {/* Patrón de puntos sutil */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
        aria-hidden
      />

      {/* ── Tarjeta centrada ─────────────────────────────────────────────────── */}
      <div
        className="relative w-full max-w-[420px] animate-slide-up overflow-hidden rounded-3xl shadow-2xl"
        style={{ background: '#FFFFFF' }}
      >
        {/* Cabecera blanca con el logo */}
        <div className="flex flex-col items-center gap-1 border-b border-gray-100 px-8 pb-6 pt-8">
          <img
            src="/logo-ixmucane.png"
            alt="Aluminios Ixmucane"
            className="object-contain"
            style={{ width: 130, height: 130 }}
            draggable={false}
          />
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
            Sistema de Administración
          </p>
        </div>

        {/* Cuerpo del formulario */}
        <div className="px-8 pb-8 pt-7">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-black text-gray-900">Bienvenido</h1>
            <p className="mt-1 text-sm font-medium text-gray-500">Ingresa con tus credenciales</p>
          </div>

          {/* Error */}
          {error ? (
            <div className="mb-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
              <p className="leading-snug">{error}</p>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            {/* Usuario */}
            <div>
              <label className="mb-1.5 block text-sm font-bold text-gray-700">
                Usuario
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                <input
                  autoComplete="username"
                  placeholder="Ingresa tu usuario"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-red-400 focus:bg-white focus:ring-2 focus:ring-red-500/15"
                  {...register('username')}
                />
              </div>
              {errors.username ? (
                <p className="mt-1.5 text-xs font-semibold text-red-600">{errors.username.message}</p>
              ) : null}
            </div>

            {/* Contraseña */}
            <div>
              <label className="mb-1.5 block text-sm font-bold text-gray-700">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-red-400 focus:bg-white focus:ring-2 focus:ring-red-500/15"
                  {...register('password')}
                />
              </div>
              {errors.password ? (
                <p className="mt-1.5 text-xs font-semibold text-red-600">{errors.password.message}</p>
              ) : null}
            </div>

            {/* Botón */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-black text-white shadow-lg transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #DC2626 0%, #9A1515 100%)' }}
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Ingresando…
                </>
              ) : (
                <>
                  Iniciar Sesión
                  <ArrowRight size={17} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-[11px] font-medium leading-relaxed text-gray-400">
            Acceso restringido al personal autorizado.
            <br />Si olvidaste tus credenciales, contacta al administrador.
          </p>
        </div>
      </div>
    </main>
  )
}
