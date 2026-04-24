import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Shield, Trash2 } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { useConfirm } from '../../shared/ui/ConfirmProvider'
import { notifyError } from '../../shared/lib/notify'
import { formatApiError } from '../../shared/lib/apiError'
import { DataTable } from '../../shared/ui/DataTable'
import { puedeGestionarCreadorYVerificacion } from '../../shared/lib/accesoSesion'
import {
  createPanelWorkerUser,
  deletePanelWorkerUser,
  listPanelWorkerUsers,
  updatePanelWorkerUser,
  type PanelWorkerUser,
  type UpdatePanelWorkerPayload,
} from '../auth/panelWorkers.service'
import {
  PANEL_MODULES_ADMIN_SELECTABLE,
  PANEL_MODULE_LABELS,
  type PanelModuleId,
  withDashboardModules,
} from '../../shared/lib/panelModules'

const queryKey = ['auth', 'panel-worker-users'] as const

export function CreadorUsuariosPage() {
  const { confirm } = useConfirm()
  const puedeVer = puedeGestionarCreadorYVerificacion()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [formError, setFormError] = useState('')

  const [editing, setEditing] = useState<PanelWorkerUser | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editError, setEditError] = useState('')

  const [permisosUser, setPermisosUser] = useState<PanelWorkerUser | null>(null)
  const [permisosSel, setPermisosSel] = useState<Set<PanelModuleId>>(() => new Set())
  const [permisosError, setPermisosError] = useState('')

  const listQuery = useQuery({
    queryKey: queryKey,
    queryFn: listPanelWorkerUsers,
    staleTime: 30_000,
    enabled: puedeVer,
  })

  const createMutation = useMutation({
    mutationFn: createPanelWorkerUser,
    onSuccess: () => {
      setFormError('')
      setUsername('')
      setPassword('')
      setPasswordConfirm('')
      void queryClient.invalidateQueries({ queryKey: queryKey })
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdatePanelWorkerPayload }) =>
      updatePanelWorkerUser(id, payload),
    onSuccess: () => {
      setEditError('')
      setEditing(null)
      void queryClient.invalidateQueries({ queryKey: queryKey })
    },
    onError: (e: Error) => setEditError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deletePanelWorkerUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKey })
    },
    onError: (e: Error) => notifyError(e.message),
  })

  const permissionsMutation = useMutation({
    mutationFn: ({ id, modules }: { id: number; modules: string[] }) => updatePanelWorkerUser(id, { modules }),
    onSuccess: () => {
      setPermisosError('')
      setPermisosUser(null)
      void queryClient.invalidateQueries({ queryKey: queryKey })
    },
    onError: (e: Error) => setPermisosError(e.message),
  })

  const openPermisos = (row: PanelWorkerUser) => {
    setPermisosError('')
    setPermisosUser(row)
    setPermisosSel(new Set(withDashboardModules(row.modules ?? [])))
  }

  const closePermisos = () => {
    setPermisosUser(null)
    setPermisosError('')
  }

  const togglePermiso = (id: PanelModuleId) => {
    if (id === 'dashboard') return
    setPermisosSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (!next.has('dashboard')) next.add('dashboard')
      return next
    })
  }

  const guardarPermisos = (e: React.FormEvent) => {
    e.preventDefault()
    if (!permisosUser) return
    setPermisosError('')
    permissionsMutation.mutate({
      id: permisosUser.id,
      modules: withDashboardModules(Array.from(permisosSel)),
    })
  }

  const openEdit = (row: PanelWorkerUser) => {
    setEditing(row)
    setEditUsername(row.username)
    setEditPassword('')
    setEditPasswordConfirm('')
    setEditActive(row.is_active)
    setEditError('')
  }

  const closeEdit = () => {
    setEditing(null)
    setEditError('')
  }

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    setEditError('')
    if (!editing) return
    const u = editUsername.trim()
    if (!u) {
      setEditError('El usuario no puede quedar vacío.')
      return
    }
    if (editPassword || editPasswordConfirm) {
      if (editPassword !== editPasswordConfirm) {
        setEditError('Las contraseñas no coinciden.')
        return
      }
      if (editPassword.length < 8) {
        setEditError('La contraseña debe tener al menos 8 caracteres.')
        return
      }
    }
    const payload: UpdatePanelWorkerPayload = {
      username: u,
      is_active: editActive,
    }
    if (editPassword) {
      payload.password = editPassword
      payload.password_confirm = editPasswordConfirm
    }
    updateMutation.mutate({ id: editing.id, payload })
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const u = username.trim()
    if (!u || !password || !passwordConfirm) {
      setFormError('Complete usuario, contraseña y confirmación.')
      return
    }
    if (password !== passwordConfirm) {
      setFormError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    createMutation.mutate({
      username: u,
      password,
      password_confirm: passwordConfirm,
    })
  }

  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? formatApiError(listQuery.error)
      : listQuery.isError
        ? 'No se pudo cargar la lista de usuarios.'
        : ''

  if (!puedeVer) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="space-y-6">
      <Card
        title="Creador de usuarios"
        subtitle="Cree cuentas para el botón Ingresar. En Permisos marque los módulos: el usuario podrá verlos y, en cada uno, crear, editar y eliminar como en administración (según la pantalla)."
      >
        {listError ? (
          <p className="mb-4 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {listError}
          </p>
        ) : null}
        <form className="mb-6 max-w-xl space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={handleCreate}>
          <p className="text-sm font-medium text-slate-800">Nuevo usuario de panel</p>
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{formError}</p>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Usuario</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              placeholder="Ej. maria_tienda"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Contraseña</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Confirmar contraseña</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-lg bg-[#c40000] px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {createMutation.isPending ? 'Creando…' : 'Crear usuario'}
          </button>
        </form>

        <DataTable<PanelWorkerUser>
          columns={[
            { key: 'username', label: 'Usuario' },
            {
              key: 'is_active',
              label: 'Activo',
              render: (row) => (row.is_active ? 'Sí' : 'No'),
            },
            {
              key: 'actions',
              label: 'Acciones',
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil size={14} aria-hidden />
                    Editar
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    onClick={() => openPermisos(row)}
                  >
                    <Shield size={14} aria-hidden />
                    Permisos
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Eliminar cuenta',
                        message: `¿Eliminar la cuenta «${row.username}»? Esta acción no se puede deshacer.`,
                        confirmLabel: 'Eliminar',
                        tone: 'danger',
                      })
                      if (!ok) return
                      deleteMutation.mutate(row.id)
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                    Eliminar
                  </button>
                </div>
              ),
            },
          ]}
          rows={Array.isArray(listQuery.data) ? listQuery.data : []}
          emptyMessage={
            listQuery.isLoading
              ? 'Cargando…'
              : listQuery.isError
                ? 'Revise el mensaje de error arriba o su conexión con el servidor.'
                : 'No hay usuarios de panel creados aún.'
          }
        />
      </Card>

      {permisosUser ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="permisos-user-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="permisos-user-title" className="text-lg font-semibold text-slate-900">
              Permisos de módulos
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Usuario: <span className="font-mono font-semibold">{permisosUser.username}</span>. Marque los módulos a
              los que podrá acceder al iniciar sesión con el botón Ingresar.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              El módulo «Inicio / Dashboard» siempre queda habilitado para poder cerrar sesión y ver el resumen básico.
              El usuario afectado debe cerrar sesión y volver a entrar para aplicar los cambios en su sesión.
            </p>
            <form className="mt-4 space-y-3" onSubmit={guardarPermisos}>
              {permisosError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{permisosError}</p>
              ) : null}
              <label className="flex cursor-not-allowed items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked disabled readOnly />
                <span>{PANEL_MODULE_LABELS.dashboard}</span>
              </label>
              <ul className="space-y-2">
                {PANEL_MODULES_ADMIN_SELECTABLE.map((id) => (
                  <li key={id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#c40000] focus:ring-[#c40000]"
                        checked={permisosSel.has(id)}
                        onChange={() => togglePermiso(id)}
                      />
                      <span>{PANEL_MODULE_LABELS[id]}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={closePermisos}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={permissionsMutation.isPending}
                  className="rounded-lg bg-[#c40000] px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                >
                  {permissionsMutation.isPending ? 'Guardando…' : 'Guardar permisos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="edit-user-title" className="text-lg font-semibold text-slate-900">
              Editar usuario
            </h2>
            <p className="mt-1 text-sm text-slate-600">Cuenta: {editing.username}</p>
            <form className="mt-4 space-y-3" onSubmit={handleSaveEdit}>
              {editError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{editError}</p>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Nombre de usuario</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Nueva contraseña (opcional)</label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Dejar vacío para no cambiar"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Confirmar nueva contraseña</label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  value={editPasswordConfirm}
                  onChange={(e) => setEditPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-[#c40000] focus:ring-[#c40000]"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                Cuenta activa
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={closeEdit}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="rounded-lg bg-[#c40000] px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                >
                  {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
