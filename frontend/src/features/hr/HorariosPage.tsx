import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '../../shared/ui/Card'
import { useConfirm } from '../../shared/ui/ConfirmProvider'
import { notifyError, notifySuccess } from '../../shared/lib/notify'
import { DataTable } from '../../shared/ui/DataTable'
import {
  createWorkSchedule,
  deleteWorkSchedule,
  listPersonnelRecords,
  listWorkSchedules,
  timeApiToInput,
  type PersonnelRecord,
  type WorkScheduleRecord,
} from './hr.service'

const scheduleQueryKey = ['hr', 'horarios'] as const
const personnelQueryKey = ['hr', 'personnel'] as const

const emptyForm = {
  personnelId: '' as '' | number,
  dias: '',
  hora_entrada: '08:00',
  hora_salida: '17:00',
}

export function HorariosPage() {
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
    queryKey: scheduleQueryKey,
    queryFn: listWorkSchedules,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  const createMutation = useMutation({
    mutationFn: createWorkSchedule,
    onSuccess: () => {
      setFormError('')
      setForm(emptyForm)
      setModalOpen(false)
      void queryClient.invalidateQueries({ queryKey: scheduleQueryKey })
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteWorkSchedule,
    onSuccess: () => {
      notifySuccess('Horario eliminado.')
      void queryClient.invalidateQueries({ queryKey: scheduleQueryKey })
    },
    onError: (err: Error) => notifyError(err.message),
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    if (form.personnelId === '' || !Number.isFinite(form.personnelId)) {
      setFormError('Seleccione un trabajador.')
      return
    }
    if (!form.hora_entrada || !form.hora_salida) {
      setFormError('Indique hora de entrada y hora de salida.')
      return
    }
    createMutation.mutate({
      personnel: form.personnelId,
      dias: form.dias.trim(),
      hora_entrada: form.hora_entrada.length === 5 ? `${form.hora_entrada}:00` : form.hora_entrada,
      hora_salida: form.hora_salida.length === 5 ? `${form.hora_salida}:00` : form.hora_salida,
    })
  }

  const rows: WorkScheduleRecord[] = Array.isArray(listQuery.data) ? listQuery.data : []
  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'No se pudo cargar el listado.'
        : ''

  return (
    <>
      <Card
        title="Horarios"
        subtitle="Horarios de entrada y salida por trabajador (guardados en el servidor)."
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
            Agregar horario
          </button>
        }
      >
        {listError ? (
          <p className="mb-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {listError}
          </p>
        ) : null}
        <DataTable<WorkScheduleRecord>
          columns={[
            { key: 'personnel_codigo', label: 'Codigo' },
            { key: 'personnel_nombre', label: 'Trabajador' },
            { key: 'dias', label: 'Dias' },
            {
              key: 'hora_entrada',
              label: 'Entrada',
              render: (row) => timeApiToInput(String(row.hora_entrada)),
            },
            {
              key: 'hora_salida',
              label: 'Salida',
              render: (row) => timeApiToInput(String(row.hora_salida)),
            },
            {
              key: 'actions',
              label: '',
              render: (row) => (
                <button
                  type="button"
                  className="text-xs font-semibold text-red-700 hover:underline"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Eliminar horario',
                      message: '¿Eliminar este horario?',
                      confirmLabel: 'Eliminar',
                      tone: 'danger',
                    })
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
            listQuery.isLoading ? 'Cargando…' : 'No hay horarios. Use Agregar horario para registrar uno.'
          }
        />
      </Card>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="horarios-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft">
            <h3 id="horarios-modal-title" className="text-lg font-semibold text-slate-900">
              Agregar horario
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Elija el trabajador y las horas de entrada y salida.
            </p>
            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              {formError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                  {formError}
                </p>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Trabajador</label>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={form.personnelId === '' ? '' : String(form.personnelId)}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => ({
                      ...f,
                      personnelId: v === '' ? '' : Number(v),
                    }))
                  }}
                  required
                >
                  <option value="">Seleccione trabajador…</option>
                  {personnel.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.nombre} {p.apellidos}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Dias (ej. Lun a Vie)</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Lun a Vie"
                  value={form.dias}
                  onChange={(e) => setForm((f) => ({ ...f, dias: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Entrada</label>
                  <input
                    type="time"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.hora_entrada}
                    onChange={(e) => setForm((f) => ({ ...f, hora_entrada: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Salida</label>
                  <input
                    type="time"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.hora_salida}
                    onChange={(e) => setForm((f) => ({ ...f, hora_salida: e.target.value }))}
                    required
                  />
                </div>
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
