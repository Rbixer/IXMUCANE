import { api } from '../../shared/api/client'

export type PersonnelPayload = {
  codigo: string
  nombre: string
  apellidos: string
  fecha_nacimiento: string | null
  puesto: string
  telefono: string
  dpi: string
  direccion_domicilio: string
  branch: number | null
  estado: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO'
  permisos: string[]
}

export type PersonnelRecord = PersonnelPayload & {
  id: number
  branch_name?: string
  created_at: string
}

export type VacationLeavePayload = {
  codigo_empleado: string
  nombre_empleado: string
  tipo_periodo: string
  fecha_salida: string
  fecha_regreso: string
  notas: string
}

export type VacationLeaveRecord = VacationLeavePayload & {
  id: number
  created_at: string
}

function normalizePersonnelList(payload: unknown): PersonnelRecord[] {
  if (Array.isArray(payload)) return payload as PersonnelRecord[]
  if (payload && typeof payload === 'object' && 'results' in payload) {
    const inner = (payload as { results?: unknown }).results
    if (Array.isArray(inner)) return inner as PersonnelRecord[]
  }
  return []
}

function normalizeVacationList(payload: unknown): VacationLeaveRecord[] {
  if (Array.isArray(payload)) return payload as VacationLeaveRecord[]
  if (payload && typeof payload === 'object' && 'results' in payload) {
    const inner = (payload as { results?: unknown }).results
    if (Array.isArray(inner)) return inner as VacationLeaveRecord[]
  }
  return []
}

export async function listPersonnelRecords() {
  const { data } = await api.get<unknown>('/hr/')
  return normalizePersonnelList(data)
}

export async function fetchNextPersonnelCodigo() {
  const { data } = await api.get<{ next_codigo: string }>('/hr/next-codigo/')
  return data
}

export async function createPersonnelRecord(payload: PersonnelPayload) {
  const { data } = await api.post<PersonnelRecord>('/hr/', payload)
  return data
}

export async function updatePersonnelRecord(id: number, payload: PersonnelPayload) {
  const { data } = await api.put<PersonnelRecord>(`/hr/${id}/`, payload)
  return data
}

export async function deletePersonnelRecord(id: number) {
  await api.delete(`/hr/${id}/`)
}

export async function listVacationLeaves() {
  const { data } = await api.get<unknown>('/hr/vacaciones/')
  return normalizeVacationList(data)
}

export async function createVacationLeave(payload: VacationLeavePayload) {
  const { data } = await api.post<VacationLeaveRecord>('/hr/vacaciones/', payload)
  return data
}

export async function deleteVacationLeave(id: number) {
  await api.delete(`/hr/vacaciones/${id}/`)
}

export type WorkSchedulePayload = {
  personnel: number
  dias: string
  hora_entrada: string
  hora_salida: string
}

export type WorkScheduleRecord = WorkSchedulePayload & {
  id: number
  personnel_codigo: string
  personnel_nombre: string
  created_at: string
}

function normalizeScheduleList(payload: unknown): WorkScheduleRecord[] {
  if (Array.isArray(payload)) return payload as WorkScheduleRecord[]
  if (payload && typeof payload === 'object' && 'results' in payload) {
    const inner = (payload as { results?: unknown }).results
    if (Array.isArray(inner)) return inner as WorkScheduleRecord[]
  }
  return []
}

export async function listWorkSchedules() {
  const { data } = await api.get<unknown>('/hr/horarios/')
  return normalizeScheduleList(data)
}

export async function createWorkSchedule(payload: WorkSchedulePayload) {
  const { data } = await api.post<WorkScheduleRecord>('/hr/horarios/', payload)
  return data
}

export async function deleteWorkSchedule(id: number) {
  await api.delete(`/hr/horarios/${id}/`)
}

/** HH:MM:SS → HH:MM para input type=time */
export function timeApiToInput(value: string): string {
  const t = (value || '').trim()
  if (t.length >= 5) return t.slice(0, 5)
  return t
}
