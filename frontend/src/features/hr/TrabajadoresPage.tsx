import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Save, Trash2, UserPlus } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { DataTable } from '../../shared/ui/DataTable'
import {
  deletePersonnelRecord,
  listPersonnelRecords,
  updatePersonnelRecord,
  type PersonnelPayload,
  type PersonnelRecord,
} from './hr.service'
import {
  personnelFormSchema,
  personnelFormToPayload,
  type PersonnelFormValues,
} from './personnelFormSchema'
import { PersonnelAltaModal } from './PersonnelAltaModal'
import { useConfirm } from '../../shared/ui/ConfirmProvider'
import { notifyError, notifySuccess } from '../../shared/lib/notify'

const estadoEtiqueta: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  SUSPENDIDO: 'Suspendido',
}

const personnelQueryKey = ['hr', 'personnel'] as const

function nombreCompleto(row: PersonnelRecord) {
  return `${row.nombre} ${row.apellidos ?? ''}`.trim()
}

function sortPersonnel(rows: PersonnelRecord[]) {
  return [...rows].sort((a, b) =>
    nombreCompleto(a).localeCompare(nombreCompleto(b), 'es', { sensitivity: 'base' }),
  )
}

const defaultForm: PersonnelFormValues = {
  codigo: '',
  nombre: '',
  apellidos: '',
  fecha_nacimiento: '',
  puesto: '',
  telefono: '',
  dpi: '',
  branchId: '',
  estado: 'ACTIVO',
}

export function TrabajadoresPage() {
  const { confirm } = useConfirm()
  const queryClient = useQueryClient()
  const [apiError, setApiError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [altaModalOpen, setAltaModalOpen] = useState(false)

  const listQuery = useQuery({
    queryKey: personnelQueryKey,
    queryFn: listPersonnelRecords,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PersonnelFormValues>({
    resolver: zodResolver(personnelFormSchema),
    defaultValues: defaultForm,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PersonnelPayload }) =>
      updatePersonnelRecord(id, payload),
    onSuccess: (record) => {
      setApiError('')
      queryClient.setQueryData<PersonnelRecord[]>(personnelQueryKey, (old) => {
        const base = Array.isArray(old) ? old : []
        const rest = base.filter((r) => r.id !== record.id)
        return sortPersonnel([...rest, record])
      })
      void queryClient.invalidateQueries({ queryKey: personnelQueryKey })
      setEditingId(null)
      reset(defaultForm)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deletePersonnelRecord,
    onSuccess: (_, id) => {
      notifySuccess('Trabajador eliminado del registro.')
      queryClient.setQueryData<PersonnelRecord[]>(personnelQueryKey, (old) => {
        const base = Array.isArray(old) ? old : []
        return base.filter((r) => r.id !== id)
      })
      void queryClient.invalidateQueries({ queryKey: personnelQueryKey })
    },
    onError: (err: Error) => notifyError(err.message),
  })

  const onSubmit = (values: PersonnelFormValues) => {
    if (!editingId) return
    setApiError('')
    updateMutation.mutate({ id: editingId, payload: personnelFormToPayload(values) })
  }

  const handleEdit = (row: PersonnelRecord) => {
    setApiError('')
    setEditingId(row.id)
    reset({
      codigo: row.codigo,
      nombre: row.nombre,
      apellidos: row.apellidos ?? '',
      fecha_nacimiento: row.fecha_nacimiento ? row.fecha_nacimiento.slice(0, 10) : '',
      puesto: row.puesto,
      telefono: row.telefono ?? '',
      dpi: row.dpi ?? '',
      branchId: row.branch != null ? String(row.branch) : '',
      estado: row.estado,
    })
  }

  const handleCancelEdit = () => {
    setApiError('')
    setEditingId(null)
    reset(defaultForm)
  }

  const handleDelete = async (row: PersonnelRecord) => {
    const ok = await confirm({
      title: 'Eliminar trabajador',
      message: `¿Eliminar a «${nombreCompleto(row)}» del registro de personal?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!ok) return
    deleteMutation.mutate(row.id)
  }

  const tableRows = Array.isArray(listQuery.data) ? listQuery.data : []
  const listadoError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'No se pudo cargar el listado.'
        : ''

  return (
    <div className="space-y-6">
      <Card
        title="Trabajadores"
        subtitle="Listado de personal. Use el boton para registrar un trabajador nuevo sin salir de esta pagina."
        action={
          <button
            type="button"
            onClick={() => setAltaModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#c40000] px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
          >
            <UserPlus size={18} aria-hidden />
            Agregar trabajador
          </button>
        }
      >
        {listadoError ? (
          <p className="mb-4 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {listadoError}
          </p>
        ) : null}

        <DataTable<PersonnelRecord>
          columns={[
            { key: 'codigo', label: 'Codigo' },
            {
              key: 'nombre',
              label: 'Nombre completo',
              render: (row) => nombreCompleto(row),
            },
            {
              key: 'fecha_nacimiento',
              label: 'Nacimiento',
              render: (row) =>
                row.fecha_nacimiento ? row.fecha_nacimiento.slice(0, 10) : '—',
            },
            { key: 'puesto', label: 'Puesto' },
            {
              key: 'telefono',
              label: 'Teléfono',
              render: (row) => (row.telefono ?? '').trim() || '—',
            },
            {
              key: 'dpi',
              label: 'DPI',
              render: (row) => (row.dpi ?? '').trim() || '—',
            },
            {
              key: 'estado',
              label: 'Estado',
              render: (row) => estadoEtiqueta[row.estado] ?? row.estado,
            },
            {
              key: 'actions',
              label: 'Acciones',
              render: (row) => (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(row)}
                    aria-label="Editar"
                    title="Editar"
                    className="inline-flex items-center justify-center rounded-md bg-slate-900 p-2 text-white transition hover:bg-slate-700"
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(row)}
                    aria-label="Eliminar"
                    title="Eliminar"
                    className="inline-flex items-center justify-center rounded-md bg-red-600 p-2 text-white transition hover:bg-red-700"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              ),
            },
          ]}
          rows={tableRows}
          emptyMessage={
            listQuery.isLoading ? 'Cargando trabajadores…' : 'No hay registros. Pulse Agregar trabajador.'
          }
        />
      </Card>

      {editingId ? (
        <div id="formulario-alta-usuario" className="scroll-mt-24">
          <Card
            title="Editar trabajador"
            subtitle="Actualice los datos y guarde los cambios, o cancele para volver al listado."
          >
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              {apiError ? (
                <p className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {apiError}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-black">Codigo</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-black"
                    disabled
                    placeholder="Codigo unico de empleado"
                    {...register('codigo')}
                  />
                  {errors.codigo ? (
                    <p className="mt-1 text-xs text-red-600">{String(errors.codigo.message)}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-black">Nombre</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black"
                    {...register('nombre')}
                  />
                  {errors.nombre ? (
                    <p className="mt-1 text-xs text-red-600">{String(errors.nombre.message)}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-black">Apellido</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black"
                    {...register('apellidos')}
                  />
                  {errors.apellidos ? (
                    <p className="mt-1 text-xs text-red-600">{String(errors.apellidos.message)}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-black">Fecha de nacimiento</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black"
                    {...register('fecha_nacimiento')}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-black">Puesto</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black"
                    {...register('puesto')}
                  />
                  {errors.puesto ? (
                    <p className="mt-1 text-xs text-red-600">{String(errors.puesto.message)}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-black">Teléfono</label>
                  <input
                    type="tel"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black"
                    {...register('telefono')}
                  />
                  {errors.telefono ? (
                    <p className="mt-1 text-xs text-red-600">{String(errors.telefono.message)}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-black">DPI</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black"
                    {...register('dpi')}
                  />
                  {errors.dpi ? <p className="mt-1 text-xs text-red-600">{String(errors.dpi.message)}</p> : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-black">Estado</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black"
                    {...register('estado')}
                  >
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                    <option value="SUSPENDIDO">Suspendido</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#c40000] px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
                >
                  {updateMutation.isPending ? (
                    <span>Guardando…</span>
                  ) : (
                    <>
                      <Save size={18} aria-hidden />
                      Guardar cambios
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar edicion
                </button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      <PersonnelAltaModal open={altaModalOpen} onClose={() => setAltaModalOpen(false)} />
    </div>
  )
}
