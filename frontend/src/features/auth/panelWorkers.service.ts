import { api } from '../../shared/api/client'

export type PanelWorkerUser = {
  id: number
  username: string
  is_active: boolean
  personnel_id: number | null
  personnel_label: string
  modules: string[]
}

export type CreatePanelWorkerPayload = {
  username: string
  password: string
  password_confirm: string
}

export async function listPanelWorkerUsers() {
  const { data } = await api.get<PanelWorkerUser[]>('/auth/panel-worker-users/')
  return data
}

export async function createPanelWorkerUser(payload: CreatePanelWorkerPayload) {
  const { data } = await api.post<PanelWorkerUser>('/auth/panel-worker-users/', {
    username: payload.username,
    password: payload.password,
    password_confirm: payload.password_confirm,
  })
  return data
}

export type UpdatePanelWorkerPayload = {
  username?: string
  password?: string
  password_confirm?: string
  is_active?: boolean
  /** Lista de ids de módulo (el servidor asegura incluir `dashboard`). */
  modules?: string[]
}

export async function updatePanelWorkerUser(id: number, payload: UpdatePanelWorkerPayload) {
  const { data } = await api.patch<PanelWorkerUser>(`/auth/panel-worker-users/${id}/`, payload)
  return data
}

export async function deletePanelWorkerUser(id: number) {
  await api.delete(`/auth/panel-worker-users/${id}/`)
}
