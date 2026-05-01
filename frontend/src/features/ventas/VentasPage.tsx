import { Fragment, type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { listBranches } from '../branches/branches.service'
import { listInventory } from '../inventory/inventory.service'
import { pickPrimaryInventoryBranchId } from '../../shared/lib/defaultBranch'
import { SaleReceiptModal } from '../pos/SaleReceiptModal'
import { createPosSale, deletePosSale, listPosCustomers, listPosSales } from '../pos/pos.service'
import type { PosCustomer, PosSale } from '../pos/pos.service'
import { esPanelSoloLecturaEnModulo } from '../../shared/lib/accesoSesion'
import { Card } from '../../shared/ui/Card'
import { formatHierarchyLabel, splitStockHierarchy } from '../../shared/lib/unitHierarchy'
import type { InventoryItem } from '../../shared/types/domain'
import { ProductSearchAddPanel } from '../inventory/InventoryProductSearch'
import { notifyError, notifySuccess } from '../../shared/lib/notify'
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
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [formError, setFormError] = useState('')
  const [receiptSale, setReceiptSale] = useState<PosSale | null>(null)

  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: listBranches })

  useEffect(() => {
    if (branchId !== 0) return
    const preferredId = pickPrimaryInventoryBranchId(branchesQuery.data ?? [])
    if (preferredId != null && preferredId > 0) setBranchId(preferredId)
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
  const customersQuery = useQuery({
    queryKey: ['pos', 'customers', customerSearch.trim().toLowerCase()],
    queryFn: () => listPosCustomers(customerSearch),
    staleTime: 30_000,
  })

  const items = invQuery.data ?? []

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const estimatedTotal = useMemo(() => {
    let sum = 0
    for (const line of lines) {
      const it = itemById.get(line.inventory_item)
      if (!it) continue
      const unit = Number(String(it.unit_price).trim())
      if (Number.isFinite(unit)) sum += unit * line.quantity
    }
    return sum
  }, [lines, itemById])

  const totalUnitsInSale = useMemo(() => lines.reduce((acc, l) => acc + l.quantity, 0), [lines])

  const saleMutation = useMutation({
    mutationFn: createPosSale,
    onSuccess: (sale) => {
      setFormError('')
      setLines([])
      setReceiptSale(sale)
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
      notifySuccess('Venta eliminada. El stock se devolvió al inventario.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'sales'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] }),
        queryClient.invalidateQueries({ queryKey: ['reports', 'sistema-pos'] }),
      ])
    },
    onError: (e: Error) => {
      setFormError(e.message)
      notifyError(e.message)
    },
  })

  const addProductFromSearch = (item: InventoryItem, addQty: number = 1) => {
    if (item.quantity <= 0) return
    const q = Math.max(1, Math.min(Math.floor(Number(addQty)) || 1, item.quantity))
    setLines((prev) => {
      const ix = prev.findIndex((l) => l.inventory_item === item.id)
      if (ix >= 0) {
        return prev.map((l, i) => {
          if (i !== ix) return l
          const nextQty = l.quantity + q
          return { ...l, quantity: Math.min(item.quantity, nextQty) }
        })
      }
      return [...prev, { inventory_item: item.id, quantity: q }]
    })
  }

  const setLineQuantityFromStock = (index: number, raw: number) => {
    setLines((prev) => {
      const row = prev[index]
      if (!row) return prev
      const it = itemById.get(row.inventory_item)
      if (!it) return prev
      const q = Math.max(1, Math.min(Math.floor(Number(raw)) || 1, it.quantity))
      return prev.map((line, i) => (i === index ? { ...line, quantity: q } : line))
    })
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const onPickCustomer = (c: PosCustomer) => {
    setSelectedCustomerId(c.id)
    setCustomerSearch(c.name)
    setCustomerName(c.name || '')
    setCustomerPhone(c.phone || '')
    setCustomerEmail(c.email || '')
    setCustomerAddress(c.address || '')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (soloLecturaPos) {
      setFormError('No tiene permiso de módulo POS para registrar ventas.')
      return
    }
    if (branchId <= 0) {
      setFormError('No hay inventario configurado en el sistema.')
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
      customer: selectedCustomerId,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_email: customerEmail.trim(),
      customer_address: customerAddress.trim(),
      payment_method: payment,
      lines: normalized,
    })
  }

  return (
    <div className="space-y-6">
      <SaleReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />
      <Card
        title="Ventas POS"
        subtitle="Registra una venta: descuenta el stock en unidades (pieza). La jerarquia fardo / paquete se muestra para lectura y en reportes; el descuento siempre es en unidades base."
      >
        <p className="text-xs text-slate-600">
          El listado de productos y las existencias son los mismos que en{' '}
          <Link to="/inventario/productos" className="font-semibold text-[#c40000] underline underline-offset-2 hover:text-red-800">
            Inventario · Productos
          </Link>
          ; al confirmar la venta se actualizan Productos, inventario y POS · Facturas.
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
                <div className="mb-2">
                  <ProductSearchAddPanel
                    items={items}
                    disabled={soloLecturaPos}
                    showQuantityBeforeAdd
                    title="Búsqueda de productos"
                    onAdd={addProductFromSearch}
                  />
                </div>
              ) : null}
              {invQuery.isLoading ? (
                <p className="text-sm text-slate-600">Cargando inventario…</p>
              ) : !items.length ? (
                <p className="text-sm text-amber-800">No hay productos en inventario para el catálogo por defecto.</p>
              ) : (
                <div className="rounded-xl border border-sky-200 bg-gradient-to-b from-sky-50 via-cyan-50/40 to-sky-50/90 p-3 shadow-sm ring-1 ring-sky-100/80">
                  <div className="mb-3 border-b border-sky-200/90 pb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-sky-900">
                      Productos en esta venta
                    </span>
                    {lines.length > 0 ? (
                      <p className="mt-0.5 text-[11px] text-sky-800/90">
                        {lines.length} línea(s) de producto · {totalUnitsInSale} unidad(es) total
                      </p>
                    ) : null}
                  </div>
                  {lines.length === 0 ? (
                    <p className="py-4 text-center text-sm text-sky-800/80">
                      Elija cantidad y pulse Añadir en la búsqueda para armar la venta.
                    </p>
                  ) : (
                    <Fragment>
                    <ul className="space-y-2">
                      {lines.map((line, idx) => {
                        const it = itemById.get(line.inventory_item)
                        if (!it) return null
                        const { fardos, paquetes, unidades } = splitStockHierarchy(
                          it.quantity,
                          it.units_per_package ?? 1,
                          it.packages_per_fardo ?? 1,
                        )
                        const stockLabel = formatHierarchyLabel(fardos, paquetes, unidades)
                        const unit = Number(String(it.unit_price).trim())
                        const lineTotal =
                          Number.isFinite(unit) && line.quantity > 0
                            ? unit * line.quantity
                            : 0
                        return (
                          <li
                            key={line.inventory_item}
                            className="flex flex-wrap items-end gap-3 rounded-lg border border-sky-200/90 bg-white/95 p-3 shadow-sm ring-1 ring-sky-100/60"
                          >
                            <div className="min-w-0 flex-1 border-l-4 border-sky-400 pl-3">
                              <p className="font-mono text-[10px] text-sky-700/90">{it.sku}</p>
                              <p className="text-sm font-semibold text-sky-950">{it.name}</p>
                              <p className="mt-0.5 text-[10px] text-sky-800/75">
                                Stock actual {it.quantity} u. ({stockLabel}) · max. venta {it.quantity} u.
                              </p>
                            </div>
                            <div className="flex flex-wrap items-end gap-2">
                              <div>
                                <label className="mb-0.5 block text-[10px] font-semibold uppercase text-sky-800">
                                  Cantidad
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={it.quantity}
                                  disabled={soloLecturaPos}
                                  className="w-20 rounded-md border border-sky-300 bg-sky-50/50 px-2 py-1.5 text-sm tabular-nums text-sky-950 outline-none ring-sky-300/40 focus:border-sky-500 focus:ring-2 disabled:bg-slate-100"
                                  value={line.quantity}
                                  onChange={(e) => setLineQuantityFromStock(idx, Number(e.target.value))}
                                />
                              </div>
                              <div className="pb-1 text-right">
                                <p className="text-[10px] font-semibold uppercase text-sky-800">Subtotal</p>
                                <p className="text-sm font-semibold tabular-nums text-sky-950">
                                  Q{' '}
                                  {lineTotal.toLocaleString('es-GT', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeLine(idx)}
                                className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 underline hover:bg-red-50"
                              >
                                Quitar
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    <footer className="mt-4 border-t border-dashed border-sky-300/90 pt-4">
                      <div className="mb-3 space-y-1 rounded-lg border border-sky-100 bg-sky-100/40 px-3 py-2 font-mono text-[11px] text-sky-900">
                        <div className="flex justify-between gap-4">
                          <span className="uppercase tracking-wide text-sky-800/90">Suma de líneas</span>
                          <span className="tabular-nums font-semibold text-sky-950">
                            Q{' '}
                            {estimatedTotal.toLocaleString('es-GT', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 text-sky-800/85">
                          <span>Productos distintos / unidades</span>
                          <span className="tabular-nums">
                            {lines.length} / {totalUnitsInSale}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-stretch justify-between gap-4 overflow-hidden rounded-lg border border-sky-300 bg-gradient-to-r from-white to-sky-50/70 shadow-md ring-1 ring-sky-100">
                        <div className="w-1.5 shrink-0 bg-gradient-to-b from-sky-400 to-cyan-500" aria-hidden />
                        <div className="flex flex-1 flex-wrap items-center justify-between gap-3 py-3 pr-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-900">
                              Total a pagar
                            </p>
                            <p className="mt-0.5 text-[11px] text-sky-800/80">Vista previa antes de registrar</p>
                          </div>
                          <p className="text-right text-2xl font-bold tabular-nums tracking-tight text-sky-950">
                            Q{' '}
                            {estimatedTotal.toLocaleString('es-GT', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                      </div>
                    </footer>
                    </Fragment>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-amber-800">Cargando…</p>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Cliente (buscar por nombre)</label>
            <div className="relative max-w-xl">
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Escriba para buscar cliente..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value)
                  setSelectedCustomerId(null)
                }}
              />
              {customerSearch.trim().length > 0 && (customersQuery.data ?? []).length > 0 ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {(customersQuery.data ?? []).slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onPickCustomer(c)}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <span className="ml-2 text-xs text-slate-500">{c.phone || c.email || 'Sin contacto'}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Nombre del cliente"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Teléfono"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Correo"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Dirección"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
            </div>
          </div>
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
