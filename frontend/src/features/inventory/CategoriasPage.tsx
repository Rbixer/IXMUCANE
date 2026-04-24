import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import {
  createProductCategory,
  deleteProductCategory,
  listProductCategories,
  updateProductCategory,
} from './categories.service'
import { listInventory } from './inventory.service'
import { splitStockHierarchy } from '../../shared/lib/unitHierarchy'
import { Card } from '../../shared/ui/Card'
import { useConfirm } from '../../shared/ui/ConfirmProvider'
import { esPanelSoloLecturaEnModulo } from '../../shared/lib/accesoSesion'

export function CategoriasPage() {
  const { confirm } = useConfirm()
  const navigate = useNavigate()
  const soloLecturaInventario = esPanelSoloLecturaEnModulo('inventario')
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')

  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyCategoryId, setVerifyCategoryId] = useState<number | ''>('')

  const listQuery = useQuery({
    queryKey: ['inventory', 'categories'],
    queryFn: () => listProductCategories(),
  })

  const verifyQuery = useQuery({
    queryKey: ['inventory', 'verify-category', verifyCategoryId],
    queryFn: () => listInventory({ category: Number(verifyCategoryId) }),
    enabled: verifyOpen && verifyCategoryId !== '' && Number(verifyCategoryId) > 0,
  })

  const createMut = useMutation({
    mutationFn: () => createProductCategory({ name: name.trim(), line: '' }),
    onSuccess: () => {
      setName('')
      setFormError('')
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'categories'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: deleteProductCategory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'categories'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const renameMut = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) => updateProductCategory(id, { name: next.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'categories'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!name.trim()) {
      setFormError('Indique un nombre de categoría.')
      return
    }
    createMut.mutate()
  }

  const openVerifyInInventory = () => {
    if (verifyCategoryId === '' || !Number(verifyCategoryId)) {
      setFormError('Elija una categoría para verificar.')
      return
    }
    void navigate(`/inventario/productos?categoria=${verifyCategoryId}`)
    setVerifyOpen(false)
  }

  if (soloLecturaInventario) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        Las categorías requieren permiso de módulo Inventario con capacidad de edición.
      </div>
    )
  }

  const rows = listQuery.data ?? []

  return (
    <div className="space-y-6">
      <header className="border-b border-material-outline pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Categorías de producto</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Agrupe referencias del inventario por categoría. Los productos se asocian a una categoría al crear o
          editarlos en Inventario.
        </p>
      </header>

      <Card title="Nueva categoría" subtitle="Nombre único en el catálogo.">
        <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm">
            <span className="text-xs font-medium text-material-muted">Nombre</span>
            <input
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              className="mt-1 w-full rounded-lg border border-material-outline bg-white px-3 py-2 text-sm"
              placeholder="Ej. Vestidos, Calzado…"
            />
          </label>
          <button
            type="submit"
            disabled={createMut.isPending}
            className="rounded-lg bg-boutique-500 px-4 py-2 text-sm font-semibold text-white hover:bg-boutique-600 disabled:opacity-60"
          >
            {createMut.isPending ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
        {formError ? <p className="mt-2 text-xs text-red-600">{formError}</p> : null}
      </Card>

      <Card
        title="Verificar productos por categoría"
        subtitle="Abre Inventario · Productos filtrado por la categoría elegida o consulte aquí el listado."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[12rem] flex-1 text-sm">
            <span className="text-xs font-medium text-material-muted">Categoría</span>
            <select
              className="mt-1 w-full rounded-lg border border-material-outline bg-white px-3 py-2 text-sm"
              value={verifyCategoryId === '' ? '' : String(verifyCategoryId)}
              onChange={(e) => {
                const v = e.target.value
                setVerifyCategoryId(v === '' ? '' : Number(v))
              }}
            >
              <option value="">Seleccione…</option>
              {rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setFormError('')
              setVerifyOpen(true)
            }}
            className="rounded-lg border border-material-outline bg-white px-4 py-2 text-sm font-semibold text-material-emphasis hover:bg-material-surface-variant"
          >
            Consultar en esta página
          </button>
          <button
            type="button"
            onClick={openVerifyInInventory}
            className="rounded-lg bg-boutique-500 px-4 py-2 text-sm font-semibold text-white hover:bg-boutique-600"
          >
            Abrir en Inventario
          </button>
        </div>
        {verifyOpen && verifyCategoryId !== '' ? (
          <div className="mt-4 rounded-lg border border-material-outline bg-material-surface-variant/40 p-3">
            {verifyQuery.isLoading ? (
              <p className="text-sm text-material-muted">Cargando productos…</p>
            ) : verifyQuery.isError ? (
              <p className="text-sm text-red-600">{(verifyQuery.error as Error).message}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-material-emphasis">
                  {(verifyQuery.data ?? []).length} producto(s) en esta categoría.
                </p>
                {(verifyQuery.data ?? []).length === 0 ? (
                  <p className="mt-1 text-xs text-material-muted">Ningún ítem tiene asignada esta categoría.</p>
                ) : (
                  <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-material-outline">
                    <table className="w-full min-w-[20rem] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-material-outline bg-material-surface-variant/80 text-material-muted">
                          <th className="px-2 py-2 font-medium">SKU / nombre</th>
                          <th className="px-2 py-2 font-medium">Fardos</th>
                          <th className="px-2 py-2 font-medium">Paquetes</th>
                          <th className="px-2 py-2 font-medium">Unidades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(verifyQuery.data ?? []).map((it) => {
                          const upp = Math.max(1, Math.floor(Number(it.units_per_package)) || 1)
                          const ppf = Math.max(1, Math.floor(Number(it.packages_per_fardo)) || 1)
                          const { fardos, paquetes, unidades } = splitStockHierarchy(it.quantity, upp, ppf)
                          return (
                            <tr key={it.id} className="border-b border-material-outline/60 last:border-0">
                              <td className="px-2 py-2 text-material-emphasis">
                                <span className="font-mono text-[10px] text-material-muted">{it.sku}</span>
                                <br />
                                <span className="text-sm">{it.name}</span>
                              </td>
                              <td className="px-2 py-2 tabular-nums">{fardos}</td>
                              <td className="px-2 py-2 tabular-nums">{paquetes}</td>
                              <td className="px-2 py-2 tabular-nums">{unidades}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </Card>

      <Card title="Listado" subtitle={listQuery.isLoading ? 'Cargando…' : `${rows.length} categorías`}>
        {rows.length === 0 && !listQuery.isLoading ? (
          <p className="text-sm text-material-muted">Aún no hay categorías.</p>
        ) : (
          <ul className="divide-y divide-material-outline rounded-lg border border-material-outline">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 font-medium text-material-emphasis">{c.name}</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-boutique-600 hover:underline"
                  onClick={() => {
                    const next = window.prompt('Nuevo nombre', c.name)
                    if (next == null || !next.trim() || next.trim() === c.name) return
                    renameMut.mutate({ id: c.id, next })
                  }}
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  title="Eliminar"
                  className="inline-flex rounded-md p-1.5 text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Eliminar categoría',
                      message: `¿Eliminar la categoría «${c.name}»? Los productos quedarán sin categoría.`,
                      confirmLabel: 'Eliminar',
                      tone: 'danger',
                    })
                    if (!ok) return
                    deleteMut.mutate(c.id)
                  }}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
