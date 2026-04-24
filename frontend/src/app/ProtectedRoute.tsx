import { Navigate, Outlet } from 'react-router-dom'
import { authStorage } from '../shared/lib/auth'

export function ProtectedRoute() {
  if (!authStorage.isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
