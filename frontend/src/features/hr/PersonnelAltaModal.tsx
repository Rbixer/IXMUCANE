import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPersonnelRecord, fetchNextPersonnelCodigo } from './hr.service'
import {
  personnelFormSchema,
  personnelFormToPayload,
  type PersonnelFormValues,
} from './personnelFormSchema'

const personnelQueryKey = ['hr', 'personnel'] as const

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

type Props = {
  open: boolean
  onClose: () => void
}

export function PersonnelAltaModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [apiError, setApiError] = useState('')
  const nextCodigoQuery = useQuery({
    queryKey: [...personnelQueryKey, 'next-codigo'],
    queryFn: fetchNextPersonnelCodigo,
    enabled: open,
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

  useEffect(() => {
    if (!open) return
    setApiError('')
    const codigo = nextCodigoQuery.data?.next_codigo?.trim() ?? ''
    reset({
      ...defaultForm,
      codigo,
    })
  }, [open, nextCodigoQuery.data?.next_codigo, reset])

  const createMutation = useMutation({
    mutationFn: createPersonnelRecord,
    onSuccess: () => {
      setApiError('')
      void queryClient.invalidateQueries({ queryKey: personnelQueryKey })
      void queryClient.invalidateQueries({ queryKey: [...personnelQueryKey, 'next-codigo'] })
      reset(defaultForm)
      onClose()
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const onSubmit = (values: PersonnelFormValues) => {
    setApiError('')
    createMutation.mutate(personnelFormToPayload(values))
  }

  if (!open) return null

  const codigoPendiente = nextCodigoQuery.isLoading || nextCodigoQuery.isFetching
  const codigoError = nextCodigoQuery.isError

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="personnel-alta-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-soft">
        <h2 id="personnel-alta-modal-title" className="text-lg font-semibold text-slate-900">
          Agregar trabajador
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          El código de empleado se asigna en forma automática e incremental. Complete teléfono, DPI y el resto de
          datos.
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit(onSubmit)}>
          {apiError ? (
            <p className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {apiError}
            </p>
          ) : null}
          {codigoError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No se pudo obtener el siguiente código. Cierre el modal e intente de nuevo.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-800">Código (automático)</label>
              <input
                readOnly
                className="w-full cursor-default rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-800"
                title="Generado por el sistema; se incrementa con cada nuevo trabajador"
                {...register('codigo')}
              />
              {codigoPendiente ? <p className="mt-1 text-xs text-slate-500">Obteniendo código…</p> : null}
              {errors.codigo ? (
                <p className="mt-1 text-xs text-red-600">{String(errors.codigo.message)}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-800">Fecha de nacimiento</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                {...register('fecha_nacimiento')}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-800">Nombre</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" {...register('nombre')} />
              {errors.nombre ? (
                <p className="mt-1 text-xs text-red-600">{String(errors.nombre.message)}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-800">Apellido</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" {...register('apellidos')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-800">Teléfono</label>
              <input
                type="tel"
                autoComplete="tel"
                placeholder="Ej. 50212345678"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                {...register('telefono')}
              />
              {errors.telefono ? (
                <p className="mt-1 text-xs text-red-600">{String(errors.telefono.message)}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-800">DPI</label>
              <input
                inputMode="numeric"
                autoComplete="off"
                placeholder="Documento personal de identificación"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                {...register('dpi')}
              />
              {errors.dpi ? <p className="mt-1 text-xs text-red-600">{String(errors.dpi.message)}</p> : null}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-800">Puesto</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" {...register('puesto')} />
              {errors.puesto ? (
                <p className="mt-1 text-xs text-red-600">{String(errors.puesto.message)}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-800">Estado</label>
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" {...register('estado')}>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
                <option value="SUSPENDIDO">Suspendido</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || codigoPendiente || codigoError || !nextCodigoQuery.data?.next_codigo}
              className="rounded-lg bg-[#c40000] px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {createMutation.isPending ? 'Guardando…' : 'Guardar trabajador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
