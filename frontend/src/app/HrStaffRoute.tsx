import { Navigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchProfile } from '../features/auth/auth.service'

/** RR.HH. solo para personal administrativo (no modo panel tienda). */
export function HrStaffRoute() {
  const q = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: fetchProfile,
    staleTime: 60_000,
  })
  if (q.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Cargando permisos…
      </div>
    )
  }
  const ok = Boolean(q.data?.is_staff || q.data?.is_superuser)
  if (!ok) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
