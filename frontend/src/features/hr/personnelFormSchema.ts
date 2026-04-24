import { z } from 'zod'
import type { PersonnelPayload } from './hr.service'

export const personnelFormSchema = z.object({
  codigo: z.string().min(1, 'Codigo requerido').max(32, 'Maximo 32 caracteres'),
  nombre: z.string().min(1, 'Nombre requerido').max(200),
  apellidos: z.string().max(200),
  fecha_nacimiento: z.string().max(32),
  puesto: z.string().min(1, 'Puesto requerido').max(120),
  telefono: z.string().min(6, 'Telefono requerido (minimo 6 digitos)').max(32),
  dpi: z.string().min(8, 'DPI requerido').max(32),
  branchId: z
    .string()
    .optional()
    .refine((v) => {
      const t = (v ?? '').trim()
      if (t === '') return true
      const n = Number.parseInt(t, 10)
      return Number.isFinite(n) && n > 0
    }, 'Seleccione una opción válida'),
  estado: z.enum(['ACTIVO', 'INACTIVO', 'SUSPENDIDO']),
})

export type PersonnelFormValues = z.infer<typeof personnelFormSchema>

export function personnelFormToPayload(values: PersonnelFormValues): PersonnelPayload {
  const fn = values.fecha_nacimiento?.trim()
  return {
    codigo: values.codigo.trim(),
    nombre: values.nombre.trim(),
    apellidos: (values.apellidos ?? '').trim(),
    fecha_nacimiento: fn && fn.length > 0 ? fn : null,
    puesto: values.puesto.trim(),
    telefono: values.telefono.trim(),
    dpi: values.dpi.trim(),
    direccion_domicilio: '',
    branch: (() => {
      const t = (values.branchId ?? '').trim()
      if (!t) return null
      return Number.parseInt(t, 10)
    })(),
    estado: values.estado,
    permisos: [],
  }
}
