import { api } from '../../shared/api/client'
import { parseLoginResponse, parseUserProfile } from '../../shared/api/schemas'

type LoginResponse = {
  access: string
  refresh: string
}

export type UserProfile = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_staff: boolean
  is_superuser: boolean
  /** Trabajador enlazado en Creador de usuarios (si aplica). */
  personnel_codigo: string
  /** Nombre del trabajador enlazado, o nombre/apellidos del usuario Django. */
  personnel_nombre_completo: string
  /** Tienda RR.HH. del trabajador enlazado (inventario por defecto). */
  personnel_branch_id?: number | null
  personnel_branch_name?: string
  /** Cuentas staff: `null` (sin filtro). Cuentas panel: ids de módulo permitidos. */
  panel_allowed_modules?: string[] | null
}

export async function loginRequest(username: string, password: string) {
  const { data } = await api.post('/auth/token/', { username, password })
  return parseLoginResponse(data) as LoginResponse
}

export async function fetchProfile(): Promise<UserProfile> {
  const { data } = await api.get('/auth/profile/')
  return parseUserProfile(data) as UserProfile
}

export type ChangePasswordPayload = {
  old_password: string
  new_password: string
  new_password_confirm: string
}

export async function changePasswordRequest(payload: ChangePasswordPayload): Promise<void> {
  await api.post('/auth/change-password/', payload)
}
