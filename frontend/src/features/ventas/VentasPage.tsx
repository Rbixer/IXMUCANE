import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { listBranches } from '../branches/branches.service'
import { listInventory } from '../inventory/inventory.service'
import { createPosSale, deletePosSale, listPosSales } from '../pos/pos.service'
import { esPanelSoloLecturaEnModulo } from '../../shared/lib/accesoSesion'
import { Card } from '../../shared/ui/Card'
import { formatHierarchyLabel, splitStockHierarchy } from '../../shared/lib/unitHierarchy'
import type { InventoryItem } from '../../shared/types/domain'
import { ProductSearchAddPanel } from '../inventory/InventoryProductSearch'
import { useConfirm } from '../../shared/ui/ConfirmProvider'

const PAYMENT_LABELS: Record<'cash' | 'card' | 'other', string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  other: 'Otro',
}

type LineDraft = { inventory_item: number; quantity: number }

export function VentasPage() {
  const { confirm } = useConfirm()
  const queryClient = useQueryClient()
  const soloLecturaPos = esPanelSoloLecturaEnModulo('pos')
  const [branchId, setBranchId] = useState<number>(0)
  const [lines, setLines] = useState<LineDraft[]>([])
  const [payment, setPayment] = useState<'cash' | 'card' | 'other'>('cash')
  const [formError, setFormError] = useState('')

  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: listBranches })

  useEffect(() => {
    const first = branchesQuery.data?.find((b) => b.id > 0)?.id
    if (first != null && first > 0 && branchId === 0) {
      setBranchId(first)
    }
  }, [branchesQuery.data, branchId])

  const invQuery = useQuery({
    queryKey: ['inventory', 'ventas', branchId],
    queryFn: () => listInventory({ branch: branchId }),
    enabled: branchId > 0,
  })

  const salesQuery = useQuery({
    queryKey: ['pos', 'sales', branchId],
    queryFn: () => listPosSales(branchId > 0 ? branchId : undefined),
  })

  const items = invQuery.data ?? []

  const saleMutation = useMutation({
    mutationFn: createPosSale,
    onSuccess: () => {
      setFormError('')
      setLines([])
      void queryClient.invalidateQueries({ queryKey: ['pos', 'sales'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
      void queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] })
      void queryClient.invalidateQueries({ queryKey: ['reports', 'sistema-pos'] })
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteSaleMut = useMutation({
    mutationFn: deletePosSale,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'sales'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] }),
        queryClient.invalidateQueries({ queryKey: ['reports', 'sistema-pos'] }),
      ])
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const addLine = () => {
    if (!items.length) return
    const first = items[0]
    setLines((prev) => [...prev, { inventory_item: first.id, quantity: 1 }])
  }

  const addProductFromSearch = (item: InventoryItem) => {
    if (item.quantity <= 0) return
    setLines((prev) => {
      const ix = prev.findIndex((l) => l.inventory_item === item.id)
      if (ix >= 0) {
        return prev.map((l, i) => {
          if (i !== ix) return l
          const nextQty = l.quantity + 1
          return { ...l, quantity: Math.min(item.quantity, Math.max(1, nextQty)) }
        })
      }
      return [...prev, { inventory_item: item.id, quantity: 1 }]
    })
  }

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (soloLecturaPos) {
      setFormError('No tiene permiso de módulo POS para registrar ventas.')
      return
    }
    if (branchId <= 0) {
      setFormError('No hay tienda configurada en el sistema.')
      return
    }
    if (!lines.length) {
      setFormError('Agregue al menos una linea.')
      return
    }
    const normalized = lines.map((l) => ({
      inventory_item: l.inventory_item,
      quantity: Math.max(1, Math.floor(Number(l.quantity)) || 1),
    }))
    saleMutation.mutate({
      branch: branchId,
      payment_method: payment,
      lines: normalized,
    })
  }

  return (
    <div className="space-y-6">
      <Card
        title="Ventas POS"
        subtitle="Registra una venta: descuenta el stock en unidades (pieza). La jerarquia fardo / paquete se muestra para lectura y en reportes; el descuento siempre es en unidades base."
      >
        <p className="text-xs text-slate-600">
          El listado de productos y las existencias son los mismos que en{' '}
          <Link to="/inventario/productos" className="font-semibold text-[#c40000] underline underline-offset-2 hover:text-red-800">
            Inventario · Productos
          </Link>
          ; al confirmar la venta se actualizan Productos, Inventario general y POS · Facturas.
        </p>
        {soloLecturaPos ? (
          <p className="text-sm text-amber-800">
            Solo puede consultar ventas. Un administrador debe asignarle el permiso de módulo POS para registrar o
            eliminar ventas.
          </p>
        ) : null}
        <form onSubmit={submit} className="mt-4 space-y-4">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{formError}</p>
          ) : null}
          {branchId > 0 ? (
            <div>
              {!invQuery.isLoading && items.length > 0 ? (
                <div className="mb-4">
                  <ProductSearchAddPanel
                    items={items}
                    disabled={soloLecturaPos}
                    onAdd={addProductFromSearch}
                  />
                </div>
              ) : null}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">Lineas</span>
                <button
                  type="button"
                  disabled={soloLecturaPos || !items.length}
                  onClick={addLine}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  Anadir linea
                </button>
              </div>
              {invQuery.isLoading ? (
                <p className="text-sm text-slate-600">Cargando inventario…</p>
              ) : !items.length ? (
                <p className="text-sm text-amber-800">No hay productos en inventario para el catálogo por defecto.</p>
              ) : (
                <ul className="space-y-2">
                  {lines.map((line, idx) => (
                    <li
                      key={`${line.inventory_item}-${idx}`}
                      className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2"
                    >
                      <div className="min-w-[12rem] flex-1">
                        <label className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-500">
                          Producto
                        </label>
                        <select
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                          value={line.inventory_item}
                          onChange={(e) => updateLine(idx, { inventory_item: Number(e.target.value) })}
                        >
                          {items.map((it) => {
                            const { fardos, paquetes, unidades } = splitStockHierarchy(
                              it.quantity,
                              it.units_per_package ?? 1,
                              it.packages_per_fardo ?? 1,
                            )
                            const j = formatHierarchyLabel(fardos, paquetes, unidades)
                            return (
                              <option key={it.id} value={it.id}>
                                {it.sku} — {it.name} (stock {it.quantity} u., {j})
                              </option>
                            )
                          })}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-500">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-xs font-semibold text-red-700 underline"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-amber-800">Cargando…</p>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Pago</label>
            <select
              className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={payment}
              disabled={soloLecturaPos}
              onChange={(e) => setPayment(e.target.value as 'cash' | 'card' | 'other')}
            >
              {(Object.keys(PAYMENT_LABELS) as ('cash' | 'card' | 'other')[]).map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={soloLecturaPos || saleMutation.isPending || branchId <= 0}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saleMutation.isPending ? 'Guardando…' : 'Registrar venta'}
          </button>
        </form>
      </Card>

      <Card title="Ultimas ventas" subtitle="Listado desde el API.">
        {salesQuery.isLoading ? (
          <p className="text-sm text-slate-600">Cargando…</p>
        ) : salesQuery.isError ? (
          <p className="text-sm text-red-700">No se pudo cargar el listado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 pr-2">ID</th>
                  <th className="py-2 pr-2">Pago</th>
                  <th className="py-2 pr-2">Productos</th>
                  <th className="py-2 pr-2">Unidades</th>
                  <th className="py-2 pr-2">Total</th>
                  <th className="py-2 pr-2">Fecha</th>
                  <th className="py-2 pr-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {(salesQuery.data ?? []).map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-mono text-xs">{s.id}</td>
                    <td className="py-2 pr-2">{PAYMENT_LABELS[s.payment_method]}</td>
                    <td className="py-2 pr-2 tabular-nums">{s.lines_count}</td>
                    <td className="py-2 pr-2 tabular-nums">{s.total_units}</td>
                    <td className="py-2 pr-2 font-medium">Q {s.total}</td>
                    <td className="py-2 pr-2 text-xs text-slate-600">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-2">
                      <button
                        type="button"
                        title="Eliminar venta"
                        disabled={soloLecturaPos || deleteSaleMut.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Eliminar venta',
                            message: `¿Eliminar la venta #${s.id} (Q ${s.total})? Se devolverá el stock al inventario.`,
                            confirmLabel: 'Eliminar',
                            tone: 'danger',
                          })
                          if (!ok) return
                          deleteSaleMut.mutate(s.id)
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
            {(salesQuery.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No hay ventas registradas.</p>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  )
}
