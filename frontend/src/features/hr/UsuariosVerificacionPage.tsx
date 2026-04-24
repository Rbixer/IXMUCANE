import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, UserPlus } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { useConfirm } from '../../shared/ui/ConfirmProvider'
import { notifyError } from '../../shared/lib/notify'
import { DataTable } from '../../shared/ui/DataTable'
import { puedeGestionarCreadorYVerificacion } from '../../shared/lib/accesoSesion'
import {
  createVerificationGrant,
  deleteVerificationGrant,
  listVerificationGrants,
  type VerificationGrant,
} from '../auth/verificationAccess.service'
import { listPersonnelRecords, type PersonnelRecord } from './hr.service'

const grantsQueryKey = ['auth', 'verification-grants'] as const
const personnelQueryKey = ['hr', 'personnel'] as const

const PERMISOS_ADMINISTRACION = [
  'Acceder al panel completo con menús de administración (no solo la vista de tienda).',
  'Gestionar inventario, stock y demás módulos permitidos para cuentas staff.',
  'Usar Recursos humanos: trabajadores, horarios, permisos y vacaciones.',
  'Gestionar usuarios verificación y el creador de cuentas del botón Ingresar.',
  'Iniciar sesión por la opción Administración en la pantalla de inicio con credenciales staff.',
  'Acceder a la consola de administración de Django (/admin/) si el despliegue lo expone.',
] as const

function etiquetaTrabajador(p: PersonnelRecord) {
  const nombre = `${p.nombre} ${p.apellidos ?? ''}`.trim()
  return `${p.codigo} — ${nombre || 'Sin nombre'}`
}

export function UsuariosVerificacionPage() {
  const { confirm } = useConfirm()
  const puedeVer = puedeGestionarCreadorYVerificacion()
  const queryClient = useQueryClient()
  const [personnelIdStr, setPersonnelIdStr] = useState('')
  const [formError, setFormError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [grantFullAdmin, setGrantFullAdmin] = useState(false)
  const [adminUsername, setAdminUsername] = useState('')
  const [modalError, setModalError] = useState('')

  const personnelQuery = useQuery({
    queryKey: personnelQueryKey,
    queryFn: listPersonnelRecords,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: puedeVer,
  })

  const grantsQuery = useQuery({
    queryKey: grantsQueryKey,
    queryFn: listVerificationGrants,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: puedeVer,
  })

  const createMutation = useMutation({
    mutationFn: createVerificationGrant,
    onSuccess: () => {
      setFormError('')
      setModalError('')
      setPersonnelIdStr('')
      setGrantFullAdmin(false)
      setAdminUsername('')
      setDialogOpen(false)
      void queryClient.invalidateQueries({ queryKey: grantsQueryKey })
    },
    onError: (err: Error) => setModalError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteVerificationGrant,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: grantsQueryKey })
    },
    onError: (err: Error) => notifyError(err.message),
  })

  const grantedPersonnelIds = new Set((grantsQuery.data ?? []).map((g) => g.personnel_id))
  const trabajadores = Array.isArray(personnelQuery.data) ? personnelQuery.data : []

  const selectedPersonnel = trabajadores.find((p) => String(p.id) === personnelIdStr)

  const openGrantDialog = () => {
    setFormError('')
    setModalError('')
    const id = Number.parseInt(personnelIdStr, 10)
    if (!Number.isFinite(id) || id <= 0) {
      setFormError('Seleccione un trabajador de la lista.')
      return
    }
    if (grantedPersonnelIds.has(id)) {
      setFormError('Ese trabajador ya tiene el permiso.')
      return
    }
    setGrantFullAdmin(false)
    setAdminUsername('')
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setModalError('')
  }

  const confirmGrant = () => {
    setModalError('')
    const id = Number.parseInt(personnelIdStr, 10)
    if (!Number.isFinite(id) || id <= 0) {
      setModalError('Selección no válida.')
      return
    }
    if (grantFullAdmin && !adminUsername.trim()) {
      setModalError(
        'Indique el nombre de usuario de la cuenta existente que recibirá permisos totales (créela antes en Creador de usuarios si hace falta).',
      )
      return
    }
    createMutation.mutate({
      personnel: id,
      grant_full_administration: grantFullAdmin,
      administration_username: grantFullAdmin ? adminUsername.trim() : undefined,
    })
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    openGrantDialog()
  }

  const listError =
    grantsQuery.isError && grantsQuery.error instanceof Error
      ? grantsQuery.error.message
      : grantsQuery.isError
        ? 'No se pudo cargar el listado.'
        : ''

  if (!puedeVer) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="space-y-6">
      <Card
        title="Usuarios verificadores"
        subtitle="Otorgue permiso de verificación del sistema a un trabajador. Opcionalmente puede promover una cuenta de acceso a administración total (staff y superusuario en la API)."
        action={
          <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
            <ShieldCheck size={16} aria-hidden />
            Permiso activo
          </span>
        }
      >
        <p className="text-sm text-slate-600">
          Elija un trabajador del personal ingresado en la casilla Trabajadores. Al otorgar permiso se mostrará un
          resumen de lo que puede hacer en administración. Puede revocar el permiso cuando lo necesite.
        </p>

        <form
          className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-end"
          onSubmit={handleSubmit}
        >
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-800">Trabajador</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              value={personnelIdStr}
              disabled={personnelQuery.isLoading || !trabajadores.length}
              onChange={(ev) => setPersonnelIdStr(ev.target.value)}
            >
              <option value="">
                {personnelQuery.isLoading
                  ? 'Cargando trabajadores…'
                  : trabajadores.length
                    ? 'Seleccione trabajador'
                    : 'No hay trabajadores registrados'}
              </option>
              {trabajadores.map((p) => (
                <option key={p.id} value={String(p.id)} disabled={grantedPersonnelIds.has(p.id)}>
                  {etiquetaTrabajador(p)}
                  {grantedPersonnelIds.has(p.id) ? ' — ya verificador' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending || !personnelIdStr}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#c40000] px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
          >
            <UserPlus size={18} aria-hidden />
            {createMutation.isPending ? 'Guardando…' : 'Otorgar permiso'}
          </button>
        </form>
        {formError ? (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{formError}</p>
        ) : null}
      </Card>

      <Card title="Listado de verificadores" subtitle="Trabajadores con permiso de verificación del sistema.">
        {listError ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{listError}</p>
        ) : null}
        <DataTable<VerificationGrant>
          columns={[
            { key: 'codigo', label: 'Codigo' },
            { key: 'nombre_completo', label: 'Nombre' },
            { key: 'puesto', label: 'Puesto' },
            {
              key: 'branch_name',
              label: 'Asignación',
              render: (row) => (row.branch_name ?? '').trim() || '—',
            },
            {
              key: 'full_administration',
              label: 'Admin. total',
              render: (row) => (row.full_administration ? 'Sí' : 'No'),
            },
            {
              key: 'promoted_username',
              label: 'Usuario promovido',
              render: (row) => (row.promoted_username ?? '').trim() || '—',
            },
            {
              key: 'granted_at',
              label: 'Permiso desde',
              render: (row) => new Date(row.granted_at).toLocaleString('es-GT'),
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
                      title: 'Revocar permiso',
                      message: `¿Quitar el permiso de verificación a «${row.nombre_completo}»?`,
                      confirmLabel: 'Revocar',
                      tone: 'danger',
                    })
                    if (!ok) return
                    deleteMutation.mutate(row.id)
                  }}
                >
                  Revocar
                </button>
              ),
            },
          ]}
          rows={grantsQuery.data ?? []}
          emptyMessage={
            grantsQuery.isLoading ? 'Cargando…' : 'Ningun trabajador con este permiso. Agregue uno arriba.'
          }
        />
      </Card>

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="grant-dialog-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="grant-dialog-title" className="text-lg font-semibold text-slate-900">
              Confirmar otorgamiento de permisos
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Trabajador seleccionado:{' '}
              <span className="font-semibold text-slate-900">
                {selectedPersonnel ? etiquetaTrabajador(selectedPersonnel) : '—'}
              </span>
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Con permisos de administración en la plataforma el usuario podrá, entre otros:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {PERMISOS_ADMINISTRACION.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
              <p className="font-semibold">Permiso de verificación del sistema</p>
              <p className="mt-1 text-xs leading-relaxed">
                Siempre se otorga al trabajador elegido (registro en Trabajadores). Opcionalmente puede promover una
                cuenta de inicio de sesión existente a administración total.
              </p>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#c40000] focus:ring-[#c40000]"
                checked={grantFullAdmin}
                onChange={(e) => setGrantFullAdmin(e.target.checked)}
              />
              <span className="text-sm text-slate-800">
                <span className="font-semibold">Otorgar también permiso total de administración</span> (staff y
                superusuario) a una cuenta de acceso ya creada.
              </span>
            </label>

            {grantFullAdmin ? (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-slate-800">Nombre de usuario a promover</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  autoComplete="off"
                  placeholder="Ej. maria_tienda"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Debe ser una cuenta sin permisos staff aún (por ejemplo creada en Creador de usuarios).
                </p>
              </div>
            ) : null}

            {modalError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{modalError}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={closeDialog}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={confirmGrant}
                className="rounded-lg bg-[#c40000] px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                {createMutation.isPending ? 'Guardando…' : 'Confirmar otorgamiento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
