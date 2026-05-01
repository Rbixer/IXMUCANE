import { type FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { listBranches } from '../branches/branches.service'
import { pickPrimaryInventoryBranchId } from '../../shared/lib/defaultBranch'
import { listInventory } from '../inventory/inventory.service'
import {
  createPurchaseOrder,
  createSupplier,
  deletePurchaseOrder,
  deleteSupplier,
  listPurchaseOrders,
  listSuppliers,
} from './suppliers.service'
import { esPanelSoloLecturaEnModulo } from '../../shared/lib/accesoSesion'
import { formatApiError } from '../../shared/lib/apiError'
import { totalUnitsFromHierarchy } from '../../shared/lib/unitHierarchy'
import { Card } from '../../shared/ui/Card'
import { notifyError, notifySuccess } from '../../shared/lib/notify'
import { useConfirm } from '../../shared/ui/ConfirmProvider'
import { LineProductAutocomplete, ProductSearchAddPanel } from '../inventory/InventoryProductSearch'
import type { Supplier } from './suppliers.service'

type LineDraft = { inventory_item: number; fardos: number; paquetes: number; unidades: number }

function supplierLabel(s: Pick<Supplier, 'id' | 'name' | 'razon_social' | 'nit'>): string {
  for (const v of [s.name, s.razon_social, s.nit]) {
    const t = (v ?? '').trim()
    if (t) return t
  }
  return `Proveedor #${s.id}`
}

export function ProveedoresPage() {
  const { confirm } = useConfirm()
  const queryClient = useQueryClient()
  const soloLecturaProveedores = esPanelSoloLecturaEnModulo('proveedores')

  const [supplierName, setSupplierName] = useState('')
  const [supplierContact, setSupplierContact] = useState('')
  const [supplierNit, setSupplierNit] = useState('')
  const [supplierRazon, setSupplierRazon] = useState('')
  const [supplierErr, setSupplierErr] = useState('')

  const [branchId, setBranchId] = useState(0)
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [orderErr, setOrderErr] = useState('')

  const suppliersQuery = useQuery({ queryKey: ['suppliers', 'proveedores'], queryFn: listSuppliers })
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: listBranches })

  useEffect(() => {
    if (branchId !== 0) return
    const id = pickPrimaryInventoryBranchId(branchesQuery.data ?? [])
    if (id != null && id > 0) setBranchId(id)
  }, [branchesQuery.data, branchId])

  const invQuery = useQuery({
    queryKey: ['inventory', 'proveedores', branchId],
    queryFn: () => listInventory({ branch: branchId }),
    enabled: branchId > 0,
  })
  const ordersQuery = useQuery({
    queryKey: ['suppliers', 'ordenes', 'all'],
    queryFn: () => listPurchaseOrders(),
  })

  const items = invQuery.data ?? []

  const createSupplierMut = useMutation({
    mutationFn: () =>
      createSupplier({
        name: supplierName.trim(),
        contact: supplierContact.trim(),
        nit: supplierNit.trim(),
        razon_social: supplierRazon.trim(),
      }),
    onSuccess: () => {
      setSupplierErr('')
      setSupplierName('')
      setSupplierContact('')
      setSupplierNit('')
      setSupplierRazon('')
      void queryClient.invalidateQueries({ queryKey: ['suppliers', 'proveedores'] })
    },
    onError: (e: Error) => setSupplierErr(e.message),
  })

  const deleteSupplierMut = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      setSupplierErr('')
      notifySuccess('Proveedor eliminado.')
      void queryClient.invalidateQueries({ queryKey: ['suppliers', 'proveedores'] })
    },
    onError: (e: unknown) => {
      const msg = formatApiError(e)
      setSupplierErr(msg)
      notifyError(msg)
    },
  })

  const createOrderMut = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      setOrderErr('')
      setLines([])
      setReference('')
      void queryClient.invalidateQueries({ queryKey: ['suppliers', 'ordenes'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
    },
    onError: (e: Error) => setOrderErr(e.message),
  })

  const deleteOrderMut = useMutation({
    mutationFn: deletePurchaseOrder,
    onSuccess: async () => {
      setOrderErr('')
      notifySuccess('Orden de compra eliminada. Se revirtió el inventario.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suppliers', 'ordenes'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] }),
      ])
    },
    onError: (e: unknown) => {
      const msg = formatApiError(e)
      setOrderErr(msg)
      notifyError(msg)
    },
  })

  const appendLineFromItem = (inventoryItemId: number) => {
    setLines((prev) => [...prev, { inventory_item: inventoryItemId, fardos: 0, paquetes: 0, unidades: 1 }])
  }

  const lineEquivUnits = (line: LineDraft): number => {
    const it = items.find((i) => i.id === line.inventory_item)
    if (!it) return 0
    return totalUnitsFromHierarchy(
      line.fardos,
      line.paquetes,
      line.unidades,
      it.units_per_package ?? 1,
      it.packages_per_fardo ?? 1,
    )
  }

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const onCreateSupplier = (e: FormEvent) => {
    e.preventDefault()
    setSupplierErr('')
    if (soloLecturaProveedores) {
      setSupplierErr('No tiene permiso de módulo Proveedores para registrar proveedores.')
      return
    }
    createSupplierMut.mutate()
  }

  const onCreateOrder = (e: FormEvent) => {
    e.preventDefault()
    setOrderErr('')
    if (soloLecturaProveedores) {
      setOrderErr('No tiene permiso de módulo Proveedores para registrar órdenes de compra.')
      return
    }
    if (branchId <= 0 || supplierId === '' || !lines.length) {
      setOrderErr('Complete proveedor y al menos una línea (se usa el catálogo por defecto del sistema).')
      return
    }
    const resolved: { inventory_item: number; quantity: number }[] = []
    for (const l of lines) {
      const it = items.find((i) => i.id === l.inventory_item)
      if (!it) {
        setOrderErr('No se encontró el producto de una línea en el inventario.')
        return
      }
      const quantity = totalUnitsFromHierarchy(
        l.fardos,
        l.paquetes,
        l.unidades,
        it.units_per_package ?? 1,
        it.packages_per_fardo ?? 1,
      )
      if (quantity < 1) {
        setOrderErr('Cada línea debe sumar al menos 1 unidad (fardos, paquetes y/o unidades sueltas).')
        return
      }
      resolved.push({ inventory_item: l.inventory_item, quantity })
    }
    createOrderMut.mutate({
      supplier: Number(supplierId),
      branch: branchId,
      reference: reference.trim(),
      lines: resolved,
    })
  }

  const suppliers = suppliersQuery.data ?? []

  return (
    <div className="space-y-6">
      {supplierErr ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{supplierErr}</div>
      ) : null}
      <Card
        title="Proveedores registrados"
        subtitle="Puede eliminar un proveedor si no tiene órdenes de compra. Use el formulario inferior para añadir uno nuevo."
      >
        {suppliersQuery.isLoading ? (
          <p className="text-sm text-slate-600">Cargando…</p>
        ) : suppliers.length === 0 ? (
          <p className="text-sm text-amber-800">Aún no hay proveedores. Complete el formulario de abajo para registrar el primero.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {suppliers.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{supplierLabel(s)}</p>
                  {s.name?.trim() && supplierLabel(s) !== s.name.trim() ? (
                    <p className="text-xs text-slate-600">Nombre: {s.name}</p>
                  ) : null}
                  {s.razon_social?.trim() ? (
                    <p className="text-xs text-slate-600">Razón social: {s.razon_social}</p>
                  ) : null}
                  {s.nit?.trim() ? <p className="text-xs text-slate-600">NIT: {s.nit}</p> : null}
                  {s.contact?.trim() ? (
                    <p className="text-xs text-slate-600">Contacto: {s.contact}</p>
                  ) : (
                    <p className="text-xs text-slate-400">Sin contacto registrado</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-400">ID {s.id}</span>
                  <button
                    type="button"
                    title="Eliminar proveedor"
                    disabled={soloLecturaProveedores || deleteSupplierMut.isPending}
                    onClick={async () => {
                      setSupplierErr('')
                      const ok = await confirm({
                        title: 'Eliminar proveedor',
                        message: `¿Eliminar el proveedor «${supplierLabel(s)}»?`,
                        confirmLabel: 'Eliminar',
                        tone: 'danger',
                      })
                      if (!ok) return
                      deleteSupplierMut.mutate(s.id)
                    }}
                    className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Registrar proveedor"
        subtitle="Nombre, contacto, NIT y razón social son opcionales. Puede guardar aunque deje todo en blanco. Las órdenes de compra registran entrada (IN) al inventario."
      >
        {soloLecturaProveedores ? (
          <p className="text-sm text-amber-800">Modo tienda: solo consulta de listados.</p>
        ) : null}
        <form onSubmit={onCreateSupplier} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Nombre (opcional)</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              disabled={soloLecturaProveedores}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Contacto (opcional)</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={supplierContact}
              onChange={(e) => setSupplierContact(e.target.value)}
              disabled={soloLecturaProveedores}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">NIT (opcional)</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={supplierNit}
              onChange={(e) => setSupplierNit(e.target.value)}
              disabled={soloLecturaProveedores}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Razón social (opcional)</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={supplierRazon}
              onChange={(e) => setSupplierRazon(e.target.value)}
              disabled={soloLecturaProveedores}
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <button
              type="submit"
              disabled={soloLecturaProveedores || createSupplierMut.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {createSupplierMut.isPending ? 'Guardando…' : 'Guardar proveedor'}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Nueva orden de compra (recepción)" subtitle="Incrementa stock y crea movimientos IN por cada línea.">
        <form onSubmit={onCreateOrder} className="mt-4 space-y-4">
          {orderErr ? <p className="text-sm text-red-700">{orderErr}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Proveedor</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={supplierId === '' ? '' : String(supplierId)}
                disabled={soloLecturaProveedores}
                onChange={(e) => {
                  const v = e.target.value
                  setSupplierId(v === '' ? '' : Number(v))
                }}
              >
                <option value="">Seleccione…</option>
                {(suppliersQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {supplierLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Referencia (opcional)</label>
            <input
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={soloLecturaProveedores}
            />
          </div>
          {branchId > 0 ? (
            <div>
              {invQuery.isLoading ? (
                <p className="text-sm text-slate-600">Cargando inventario…</p>
              ) : !items.length ? (
                <p className="text-sm text-amber-800">No hay productos en inventario para el catálogo por defecto.</p>
              ) : (
                <ProductSearchAddPanel
                  purpose="purchase"
                  title="Escoger productos"
                  headingClassName="text-sm font-semibold text-slate-800"
                  items={items}
                  disabled={soloLecturaProveedores}
                  onAdd={(it) => {
                    setOrderErr('')
                    appendLineFromItem(it.id)
                  }}
                />
              )}
            </div>
          ) : null}
          {branchId > 0 ? (
            <div>
              <div className="mb-2">
                <span className="text-xs font-semibold text-slate-700">Líneas</span>
              </div>
              {invQuery.isLoading || !items.length ? null : (
                <ul className="space-y-2">
                  {lines.map((line, idx) => (
                    <li
                      key={`${line.inventory_item}-${idx}`}
                      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                    >
                      <div className="flex flex-wrap items-start gap-2">
                        <LineProductAutocomplete
                          itemId={line.inventory_item}
                          items={items}
                          disabled={soloLecturaProveedores}
                          onPick={(id) =>
                            updateLine(idx, { inventory_item: id, fardos: 0, paquetes: 0, unidades: 1 })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="mt-5 shrink-0 text-xs font-semibold text-red-700 underline sm:mt-6"
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <div className="w-24">
                          <label className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-500">
                            Fardos
                          </label>
                          <input
                            type="number"
                            min={0}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                            value={line.fardos}
                            onChange={(e) =>
                              updateLine(idx, { fardos: Math.max(0, Math.floor(Number(e.target.value)) || 0) })
                            }
                          />
                        </div>
                        <div className="w-24">
                          <label className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-500">
                            Paquetes
                          </label>
                          <input
                            type="number"
                            min={0}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                            value={line.paquetes}
                            onChange={(e) =>
                              updateLine(idx, { paquetes: Math.max(0, Math.floor(Number(e.target.value)) || 0) })
                            }
                          />
                        </div>
                        <div className="w-24">
                          <label className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-500">
                            Unidades
                          </label>
                          <input
                            type="number"
                            min={0}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                            value={line.unidades}
                            onChange={(e) =>
                              updateLine(idx, { unidades: Math.max(0, Math.floor(Number(e.target.value)) || 0) })
                            }
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-600">
                        Recibido en inventario: <span className="font-semibold text-slate-900">{lineEquivUnits(line)}</span>{' '}
                        unidades (piezas).
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={soloLecturaProveedores || createOrderMut.isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {createOrderMut.isPending ? 'Registrando…' : 'Registrar orden y recepción'}
          </button>
        </form>
      </Card>

      <Card title="Órdenes recientes" subtitle="Listado global de órdenes registradas.">
        {ordersQuery.isLoading ? (
          <p className="text-sm text-slate-600">Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 pr-2">ID</th>
                  <th className="py-2 pr-2">Proveedor</th>
                  <th className="py-2 pr-2">Líneas</th>
                  <th className="py-2 pr-2">Ref.</th>
                  <th className="py-2 pr-2">Fecha</th>
                  <th className="py-2 pr-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {(ordersQuery.data ?? []).map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-mono text-xs">{o.id}</td>
                    <td className="py-2 pr-2">{o.supplier_name}</td>
                    <td className="py-2 pr-2">{o.lines_count}</td>
                    <td className="py-2 pr-2 text-xs">{o.reference || '—'}</td>
                    <td className="py-2 pr-2 text-xs text-slate-600">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-2">
                      <button
                        type="button"
                        title="Eliminar orden y revertir inventario"
                        disabled={soloLecturaProveedores || deleteOrderMut.isPending}
                        onClick={async () => {
                          setOrderErr('')
                          const ok = await confirm({
                            title: 'Eliminar orden de compra',
                            message: `¿Eliminar la orden #${o.id}? Se revertirá la entrada de stock de esta recepción.`,
                            confirmLabel: 'Eliminar',
                            tone: 'danger',
                          })
                          if (!ok) return
                          deleteOrderMut.mutate(o.id)
                        }}
                        className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(ordersQuery.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No hay órdenes.</p>
            ) : null}
          </div>
        )}
      </Card>

    </div>
  )
}
