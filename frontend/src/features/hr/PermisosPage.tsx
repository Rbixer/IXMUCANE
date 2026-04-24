import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '../../shared/ui/Card'
import { useConfirm } from '../../shared/ui/ConfirmProvider'
import { notifyError } from '../../shared/lib/notify'
import { DataTable } from '../../shared/ui/DataTable'
import {
  createVacationLeave,
  deleteVacationLeave,
  listPersonnelRecords,
  listVacationLeaves,
  type PersonnelRecord,
  type VacationLeaveRecord,
} from './hr.service'

const vacationQueryKey = ['hr', 'vacaciones'] as const
const personnelQueryKey = ['hr', 'personnel'] as const

const emptyForm = {
  personnelId: '' as '' | number,
  codigo_empleado: '',
  nombre_empleado: '',
  tipo_periodo: 'Vacaciones' as 'Vacaciones' | 'Descansos',
  fecha_salida: '',
  fecha_regreso: '',
  notas: '',
}

export function PermisosPage() {
  const { confirm } = useConfirm()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')

  const personnelQuery = useQuery({
    queryKey: personnelQueryKey,
    queryFn: listPersonnelRecords,
    staleTime: 30_000,
  })
  const personnel: PersonnelRecord[] = Array.isArray(personnelQuery.data) ? personnelQuery.data : []

  const listQuery = useQuery({
    queryKey: vacationQueryKey,
    queryFn: listVacationLeaves,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  const createMutation = useMutation({
    mutationFn: createVacationLeave,
    onSuccess: () => {
      setFormError('')
      setForm(emptyForm)
      setModalOpen(false)
      void queryClient.invalidateQueries({ queryKey: vacationQueryKey })
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteVacationLeave,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vacationQueryKey })
    },
    onError: (err: Error) => window.alert(err.message),
  })

  const applyPersonnelSelection = (id: number | '') => {
    if (id === '') {
      setForm((f) => ({ ...f, personnelId: '', codigo_empleado: '', nombre_empleado: '' }))
      return
    }
    const p = personnel.find((x) => x.id === id)
    if (!p) return
    setForm((f) => ({
      ...f,
      personnelId: id,
      codigo_empleado: p.codigo,
      nombre_empleado: `${p.nombre} ${p.apellidos}`.trim(),
    }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    if (!form.codigo_empleado.trim() || !form.nombre_empleado.trim()) {
      setFormError('Seleccione un trabajador o indique codigo y nombre.')
      return
    }
    if (!form.fecha_salida || !form.fecha_regreso) {
      setFormError('Indique la fecha en que sale y la fecha en que regresa.')
      return
    }
    if (form.fecha_regreso < form.fecha_salida) {
      setFormError('La fecha de regreso no puede ser anterior a la fecha de salida.')
      return
    }
    createMutation.mutate({
      codigo_empleado: form.codigo_empleado.trim(),
      nombre_empleado: form.nombre_empleado.trim(),
      tipo_periodo: form.tipo_periodo,
      fecha_salida: form.fecha_salida,
      fecha_regreso: form.fecha_regreso,
      notas: form.notas.trim(),
    })
  }

  const rows: VacationLeaveRecord[] = Array.isArray(listQuery.data) ? listQuery.data : []
  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'No se pudo cargar el listado.'
        : ''

  return (
    <>
      <Card
        title="Permisos"
        subtitle="Vacaciones y descansos: trabajador, periodo y fechas de salida y regreso."
        action={
          <button
            type="button"
            onClick={() => {
              setFormError('')
              setForm(emptyForm)
              setModalOpen(true)
            }}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Agregar permisos
          </button>
        }
      >
        {listError ? (
          <p className="mb-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {listError}
          </p>
        ) : null}
        <DataTable<VacationLeaveRecord>
          columns={[
            { key: 'codigo_empleado', label: 'Codigo' },
            { key: 'nombre_empleado', label: 'Nombre' },
            { key: 'tipo_periodo', label: 'Tipo' },
            {
              key: 'fecha_salida',
              label: 'Sale',
              render: (row) => row.fecha_salida,
            },
            {
              key: 'fecha_regreso',
              label: 'Regresa',
              render: (row) => row.fecha_regreso,
            },
            {
              key: 'notas',
              label: 'Notas',
              render: (row) => {
                const n = (row.notas ?? '').trim()
                if (!n) return '—'
                return n.length > 36 ? `${n.slice(0, 36)}…` : n
              },
            },
            {
              key: 'actions',
              label: '',
              render: (row) => (
                <button
                  type="button"
                  className="text-xs font-semibold text-red-700 hover:underline"
                  onClick={() => {
                    const ok = window.confirm('Eliminar este registro de permisos?')
                    if (!ok) return
                    deleteMutation.mutate(row.id)
                  }}
                >
                  Quitar
                </button>
              ),
            },
          ]}
          rows={rows}
          emptyMessage={
            listQuery.isLoading ? 'Cargando…' : 'No hay permisos registrados. Usa Agregar permisos.'
          }
        />
      </Card>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="permisos-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft">
            <h3 id="permisos-modal-title" className="text-lg font-semibold text-slate-900">
              Agregar permiso
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Elija el tipo con el control deslizante y complete las fechas.
            </p>
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              {formError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                  {formError}
                </p>
              ) : null}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Tipo de permiso
                </p>
                <div className="relative rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-inner">
                  <div
                    className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow transition-transform duration-200 ease-out ${
                      form.tipo_periodo === 'Descansos' ? 'translate-x-full' : 'translate-x-0'
                    }`}
                    aria-hidden
                  />
                  <div className="relative grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tipo_periodo: 'Vacaciones' }))}
                      className={`relative z-10 rounded-lg py-2.5 text-sm font-semibold transition ${
                        form.tipo_periodo === 'Vacaciones'
                          ? 'text-[#c40000]'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Vacaciones
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tipo_periodo: 'Descansos' }))}
                      className={`relative z-10 rounded-lg py-2.5 text-sm font-semibold transition ${
                        form.tipo_periodo === 'Descansos'
                          ? 'text-[#c40000]'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Descansos
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Deslice el resaltado entre <strong>Vacaciones</strong> y <strong>Descansos</strong>.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Trabajador</label>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  value={form.personnelId === '' ? '' : String(form.personnelId)}
                  onChange={(e) => {
                    const v = e.target.value
                    applyPersonnelSelection(v === '' ? '' : Number(v))
                  }}
                >
                  <option value="">Seleccione un trabajador…</option>
                  {personnel.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.nombre} {p.apellidos}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Si no aparece en la lista, puede editar codigo y nombre debajo.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Codigo</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.codigo_empleado}
                    onChange={(e) => setForm((f) => ({ ...f, codigo_empleado: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Nombre</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.nombre_empleado}
                    onChange={(e) => setForm((f) => ({ ...f, nombre_empleado: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Fecha sale</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.fecha_salida}
                    onChange={(e) => setForm((f) => ({ ...f, fecha_salida: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Fecha regresa</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.fecha_regreso}
                    onChange={(e) => setForm((f) => ({ ...f, fecha_regreso: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Notas opcionales</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Notas"
                  value={form.notas}
                  onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {createMutation.isPending ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
