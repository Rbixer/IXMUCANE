import { api } from '../../shared/api/client'

export type VerificationGrant = {
  id: number
  personnel_id: number
  codigo: string
  nombre_completo: string
  puesto: string
  branch_name: string
  granted_at: string
  full_administration: boolean
  promoted_username: string
}

export async function listVerificationGrants() {
  const { data } = await api.get<VerificationGrant[]>('/auth/verification-grants/')
  return data
}

export type CreateVerificationGrantPayload = {
  personnel: number
  grant_full_administration?: boolean
  administration_username?: string
}

export async function createVerificationGrant(payload: CreateVerificationGrantPayload) {
  const { data } = await api.post<VerificationGrant>('/auth/verification-grants/', {
    personnel: payload.personnel,
    grant_full_administration: payload.grant_full_administration ?? false,
    administration_username: payload.administration_username ?? '',
  })
  return data
}

export async function deleteVerificationGrant(grantId: number) {
  await api.delete(`/auth/verification-grants/${grantId}/`)
}
