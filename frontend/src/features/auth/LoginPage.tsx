import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Lock, User } from 'lucide-react'
import { BrandLogoMark } from '../../shared/ui/BrandLogoMark'
import { fetchProfile, loginRequest } from './auth.service'
import { authStorage } from '../../shared/lib/auth'
import { setPanelBranchIdInStorage } from '../../shared/lib/panelBranch'
import { setPanelModulesDesdePerfil, setSesionTrasLogin } from '../../shared/lib/accesoSesion'
import { notifyError, notifyInfo } from '../../shared/lib/notify'

/** Evita repetir el aviso al recargar o por doble montaje en desarrollo. Se borra al iniciar sesión bien. */
const SESION_MSG_KEY = 'boutique_login_motivo_sesion_visto'

const loginSchema = z.object({
  username: z.string().min(1, 'Usuario requerido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    if (searchParams.get('motivo') !== 'sesion') return

    const stripMotivo = () => {
      const next = new URLSearchParams(searchParams.toString())
      if (!next.has('motivo')) return
      next.delete('motivo')
      setSearchParams(next, { replace: true })
    }

    const msg =
      'Tu sesión expiró o el token ya no es válido. Inicia sesión de nuevo para continuar en el panel.'

    if (sessionStorage.getItem(SESION_MSG_KEY) === '1') {
      stripMotivo()
      return
    }
    sessionStorage.setItem(SESION_MSG_KEY, '1')
    stripMotivo()
    setError(msg)
    notifyInfo(msg)
  }, [searchParams, setSearchParams])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

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
        const msg =
          'No se pudo comprobar el perfil. Revise la conexión con el servidor e intente de nuevo.'
        setError(msg)
        notifyError(msg)
        return
      }

      const puedeAdmin = Boolean(profile.is_staff || profile.is_superuser)
      setSesionTrasLogin(puedeAdmin ? 'admin' : 'panel', puedeAdmin)
      setPanelModulesDesdePerfil(puedeAdmin ? null : profile.panel_allowed_modules)

      const bid =
        profile.personnel_branch_id != null &&
        Number.isFinite(profile.personnel_branch_id) &&
        profile.personnel_branch_id > 0
          ? profile.personnel_branch_id
          : null
      setPanelBranchIdInStorage(bid)

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('boutique_resumen_admin')
      }
      void queryClient.removeQueries({ queryKey: ['auth', 'profile'] })
      sessionStorage.removeItem(SESION_MSG_KEY)
      navigate('/dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Credenciales inválidas. Intente de nuevo.'
      setError(msg)
      notifyError(msg)
    }
  })

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-material-canvas via-white to-boutique-50/30 px-4 py-10 text-material-emphasis">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-boutique-500/12 to-transparent"
        aria-hidden
      />
      <div className="relative w-full max-w-md">
        <header className="mb-8 flex flex-col items-center text-center">
          <BrandLogoMark size="lg" className="shrink-0" />
          <h1 className="font-display mt-5 text-2xl font-semibold tracking-tight text-material-emphasis sm:text-3xl">
            <span className="text-material-muted">Aluminios</span>{' '}
            <span className="font-bold text-boutique-600">Ixmucane</span>
          </h1>
        </header>

        <div className="overflow-hidden rounded-2xl border border-material-outline-strong bg-material-surface shadow-soft">
          <div className="h-1 bg-gradient-to-r from-boutique-500 via-boutique-600 to-red-800" aria-hidden />
          <div className="p-6 sm:p-8">
            <form className="space-y-4" onSubmit={onSubmit}>
              {error ? (
                <div
                  className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-3 text-left text-sm text-amber-950"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                  <p className="leading-snug">{error}</p>
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <User className="h-3.5 w-3.5 text-boutique-500" aria-hidden />
                  Usuario
                </label>
                <input
                  autoComplete="username"
                  placeholder="Escriba su usuario"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-boutique-500/25 transition focus:border-boutique-500 focus:ring-2"
                  {...register('username')}
                />
                {errors.username ? (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{errors.username.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <Lock className="h-3.5 w-3.5 text-boutique-500" aria-hidden />
                  Contraseña
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-boutique-500/25 transition focus:border-boutique-500 focus:ring-2"
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{errors.password.message}</p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full rounded-xl bg-boutique-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-boutique-600 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isSubmitting ? 'Ingresando…' : 'Ingresar al panel'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
          Conexión cifrada con el servidor. Si olvidó sus credenciales, contacte al administrador del sistema.
        </p>
      </div>
    </main>
  )
}
