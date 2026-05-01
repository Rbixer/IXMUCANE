import { type FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  Trash2,
  Plus,
  Building2,
  Hash,
  Phone,
  FileText,
  X,
  ChevronDown,
  PackagePlus,
} from 'lucide-react'
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
import { notifyError, notifySuccess } from '../../shared/lib/notify'
import { useConfirm } from '../../shared/ui/ConfirmProvider'
import { LineProductAutocomplete, ProductSearchAddPanel } from '../inventory/InventoryProductSearch'
import type { Supplier, PurchaseOrderListItem } from './suppliers.service'

type LineDraft = { inventory_item: number; fardos: number; paquetes: number; unidades: number }

function supplierLabel(s: Pick<Supplier, 'id' | 'name' | 'razon_social' | 'nit'>): string {
  for (const v of [s.name, s.razon_social, s.nit]) {
    const t = (v ?? '').trim()
    if (t) return t
  }
  return `Proveedor #${s.id}`
}

/* ── Small form field ────────────────────────────────────────────────────── */
function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  span2,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  span2?: boolean
}) {
  return (
    <div className={span2 ? 'sm:col-span-2' : ''}>
      <label className="mb-1 block text-xs font-semibold text-app-muted">{label}</label>
      <input
        className="input-base w-full py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
export function ProveedoresPage() {
  const { confirm } = useConfirm()
  const queryClient = useQueryClient()
  const soloLectura = esPanelSoloLecturaEnModulo('proveedores')

  /* ── Form states ──────────────────────────────────────────────────────── */
  const [supplierName,    setSupplierName]    = useState('')
  const [supplierContact, setSupplierContact] = useState('')
  const [supplierNit,     setSupplierNit]     = useState('')
  const [supplierRazon,   setSupplierRazon]   = useState('')
  const [supplierErr,     setSupplierErr]     = useState('')
  const [showNewSupplier, setShowNewSupplier] = useState(false)

  const [branchId,    setBranchId]    = useState(0)
  const [supplierId,  setSupplierId]  = useState<number | ''>('')
  const [reference,   setReference]   = useState('')
  const [lines,       setLines]       = useState<LineDraft[]>([])
  const [orderErr,    setOrderErr]    = useState('')
  const [showNewOrder, setShowNewOrder] = useState(false)

  /* ── Queries ──────────────────────────────────────────────────────────── */
  const suppliersQuery = useQuery({ queryKey: ['suppliers', 'proveedores'], queryFn: listSuppliers })
  const branchesQuery  = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const ordersQuery    = useQuery<PurchaseOrderListItem[]>({ queryKey: ['suppliers', 'ordenes', 'all'], queryFn: () => listPurchaseOrders() })

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
  const items = invQuery.data ?? []

  /* ── Mutations ────────────────────────────────────────────────────────── */
  const createSupplierMut = useMutation({
    mutationFn: () => createSupplier({ name: supplierName.trim(), contact: supplierContact.trim(), nit: supplierNit.trim(), razon_social: supplierRazon.trim() }),
    onSuccess: () => {
      setSupplierErr(''); setSupplierName(''); setSupplierContact(''); setSupplierNit(''); setSupplierRazon('')
      setShowNewSupplier(false)
      void queryClient.invalidateQueries({ queryKey: ['suppliers', 'proveedores'] })
      notifySuccess('Proveedor registrado.')
    },
    onError: (e: Error) => setSupplierErr(e.message),
  })

  const deleteSupplierMut = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => { notifySuccess('Proveedor eliminado.'); void queryClient.invalidateQueries({ queryKey: ['suppliers', 'proveedores'] }) },
    onError: (e: unknown) => { const msg = formatApiError(e); setSupplierErr(msg); notifyError(msg) },
  })

  const createOrderMut = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      setOrderErr(''); setLines([]); setReference(''); setShowNewOrder(false)
      void queryClient.invalidateQueries({ queryKey: ['suppliers', 'ordenes'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
      notifySuccess('Orden de compra registrada. Stock actualizado.')
    },
    onError: (e: Error) => setOrderErr(e.message),
  })

  const deleteOrderMut = useMutation({
    mutationFn: deletePurchaseOrder,
    onSuccess: async () => {
      notifySuccess('Orden de compra eliminada. Se revirtió el inventario.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suppliers', 'ordenes'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['reports', 'inventario'] }),
      ])
    },
    onError: (e: unknown) => { const msg = formatApiError(e); setOrderErr(msg); notifyError(msg) },
  })

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  const appendLine = (inventoryItemId: number) => {
    setLines((p) => [...p, { inventory_item: inventoryItemId, fardos: 0, paquetes: 0, unidades: 1 }])
  }
  const lineEquiv = (line: LineDraft): number => {
    const it = items.find((i) => i.id === line.inventory_item)
    if (!it) return 0
    return totalUnitsFromHierarchy(line.fardos, line.paquetes, line.unidades, it.units_per_package ?? 1, it.packages_per_fardo ?? 1)
  }
  const updateLine = (idx: number, patch: Partial<LineDraft>) =>
    setLines((p) => p.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const removeLine = (idx: number) => setLines((p) => p.filter((_, i) => i !== idx))

  const onCreateSupplier = (e: FormEvent) => {
    e.preventDefault(); setSupplierErr('')
    if (soloLectura) { setSupplierErr('Sin permiso.'); return }
    createSupplierMut.mutate()
  }

  const onCreateOrder = (e: FormEvent) => {
    e.preventDefault(); setOrderErr('')
    if (soloLectura) { setOrderErr('Sin permiso.'); return }
    if (branchId <= 0 || supplierId === '' || !lines.length) {
      setOrderErr('Seleccione proveedor y agregue al menos un producto.')
      return
    }
    const resolved: { inventory_item: number; quantity: number }[] = []
    for (const l of lines) {
      const it = items.find((i) => i.id === l.inventory_item)
      if (!it) { setOrderErr('Producto de una línea no encontrado.'); return }
      const quantity = totalUnitsFromHierarchy(l.fardos, l.paquetes, l.unidades, it.units_per_package ?? 1, it.packages_per_fardo ?? 1)
      if (quantity < 1) { setOrderErr('Cada línea debe sumar al menos 1 unidad.'); return }
      resolved.push({ inventory_item: l.inventory_item, quantity })
    }
    createOrderMut.mutate({ supplier: Number(supplierId), branch: branchId, reference: reference.trim(), lines: resolved })
  }

  const suppliers = suppliersQuery.data ?? []

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-6"
        style={{ background: 'linear-gradient(135deg, #07090F 0%, #0d1020 50%, #0a100a 100%)' }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(ellipse at 15% 50%, rgba(16,185,129,0.10) 0%, transparent 55%), radial-gradient(ellipse at 85% 20%, rgba(245,158,11,0.07) 0%, transparent 50%)' }}
          aria-hidden
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-800">
              <Truck size={18} strokeWidth={2} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Proveedores</h1>
              <p className="text-[11px] text-white/40">Registro de proveedores y órdenes de compra</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!soloLectura && (
              <>
                <button
                  type="button"
                  onClick={() => { setShowNewSupplier((o) => !o); setShowNewOrder(false) }}
                  className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/14"
                >
                  <Plus size={14} /> Proveedor
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewOrder((o) => !o); setShowNewSupplier(false) }}
                  className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-3.5 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
                >
                  <PackagePlus size={14} /> Nueva orden
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Alerta de error global ───────────────────────────────────────── */}
      {supplierErr ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <X size={15} className="mt-0.5 shrink-0 cursor-pointer" onClick={() => setSupplierErr('')} />
          {supplierErr}
        </div>
      ) : null}

      {/* ── Formulario: nuevo proveedor (colapsable) ─────────────────────── */}
      {showNewSupplier ? (
        <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-app-muted" />
              <h2 className="text-sm font-bold text-app-text">Registrar proveedor</h2>
            </div>
            <button type="button" onClick={() => setShowNewSupplier(false)} className="text-app-muted hover:text-app-text">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={onCreateSupplier} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre (opcional)"       value={supplierName}    onChange={setSupplierName}    disabled={soloLectura} span2 />
            <Field label="Contacto (opcional)"     value={supplierContact} onChange={setSupplierContact} disabled={soloLectura} />
            <Field label="NIT (opcional)"          value={supplierNit}     onChange={setSupplierNit}     disabled={soloLectura} />
            <Field label="Razón social (opcional)" value={supplierRazon}   onChange={setSupplierRazon}   disabled={soloLectura} span2 />
            {supplierErr ? <p className="sm:col-span-2 text-xs text-red-600">{supplierErr}</p> : null}
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={soloLectura || createSupplierMut.isPending}
                className="btn-primary px-5 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {createSupplierMut.isPending ? 'Guardando…' : 'Guardar proveedor'}
              </button>
              <button type="button" onClick={() => setShowNewSupplier(false)} className="rounded-xl border border-app-border px-4 py-2 text-sm text-app-muted hover:text-app-text">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── Formulario: nueva orden de compra (colapsable) ───────────────── */}
      {showNewOrder ? (
        <div className="rounded-2xl border border-emerald-200/50 bg-app-surface p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackagePlus size={15} className="text-emerald-600" />
              <h2 className="text-sm font-bold text-app-text">Nueva orden de compra</h2>
              <span className="text-xs text-app-muted">· Incrementa stock automáticamente</span>
            </div>
            <button type="button" onClick={() => setShowNewOrder(false)} className="text-app-muted hover:text-app-text">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={onCreateOrder} className="space-y-4">
            {orderErr ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{orderErr}</p> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-muted">Proveedor</label>
                <select
                  className="input-base w-full py-2 text-sm"
                  value={supplierId === '' ? '' : String(supplierId)}
                  disabled={soloLectura}
                  onChange={(e) => setSupplierId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">Seleccione…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{supplierLabel(s)}</option>
                  ))}
                </select>
              </div>
              <Field label="Referencia (opcional)" value={reference} onChange={setReference} disabled={soloLectura} placeholder="Ej. Factura 2024-001" />
            </div>

            {branchId > 0 ? (
              <>
                {invQuery.isLoading ? (
                  <p className="text-sm text-app-muted">Cargando inventario…</p>
                ) : !items.length ? (
                  <p className="text-sm text-amber-700">No hay productos en el catálogo por defecto.</p>
                ) : (
                  <ProductSearchAddPanel
                    purpose="purchase"
                    title="Buscar producto"
                    headingClassName="text-xs font-semibold text-app-muted"
                    items={items}
                    disabled={soloLectura}
                    onAdd={(it) => { setOrderErr(''); appendLine(it.id) }}
                  />
                )}

                {lines.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-app-muted">Líneas ({lines.length})</p>
                    <ul className="space-y-2">
                      {lines.map((line, idx) => (
                        <li key={`${line.inventory_item}-${idx}`} className="rounded-xl border border-app-border bg-app-bg p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <LineProductAutocomplete
                              itemId={line.inventory_item}
                              items={items}
                              disabled={soloLectura}
                              onPick={(id) => updateLine(idx, { inventory_item: id, fardos: 0, paquetes: 0, unidades: 1 })}
                            />
                            <button type="button" onClick={() => removeLine(idx)} className="mt-5 shrink-0 text-red-400 hover:text-red-600">
                              <X size={14} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {(['fardos', 'paquetes', 'unidades'] as const).map((field) => (
                              <div key={field} className="w-20">
                                <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-app-muted capitalize">{field}</label>
                                <input
                                  type="number"
                                  min={0}
                                  className="input-base w-full py-1.5 text-xs"
                                  value={line[field]}
                                  onChange={(e) => updateLine(idx, { [field]: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                                />
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-[11px] text-app-muted">
                            Total a ingresar: <span className="font-bold text-app-text">{lineEquiv(line)}</span> unidades base
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={soloLectura || createOrderMut.isPending}
                className="btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {createOrderMut.isPending ? 'Registrando…' : 'Registrar recepción'}
              </button>
              <button type="button" onClick={() => setShowNewOrder(false)} className="rounded-xl border border-app-border px-4 py-2 text-sm text-app-muted hover:text-app-text">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── Proveedores registrados ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-app-muted" />
            <h2 className="text-sm font-bold text-app-text">Proveedores registrados</h2>
          </div>
          <span className="rounded-full bg-app-bg border border-app-border px-2.5 py-0.5 text-xs font-semibold text-app-muted">
            {suppliers.length}
          </span>
        </div>

        {suppliersQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-app-muted">Cargando…</div>
        ) : suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-sm text-app-muted">
            <Truck size={28} className="text-app-subtle" />
            <p>No hay proveedores registrados aún.</p>
            {!soloLectura ? (
              <button type="button" onClick={() => setShowNewSupplier(true)} className="btn-primary mt-1 px-4 py-1.5 text-xs">
                Registrar primero
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-0 divide-y divide-app-border/50">
            {suppliers.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-app-bg/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-app-text">{supplierLabel(s)}</p>
                  <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-app-muted">
                    {s.razon_social?.trim() ? <span className="flex items-center gap-1"><FileText size={10} />{s.razon_social}</span> : null}
                    {s.nit?.trim() ? <span className="flex items-center gap-1"><Hash size={10} />{s.nit}</span> : null}
                    {s.contact?.trim() ? <span className="flex items-center gap-1"><Phone size={10} />{s.contact}</span> : <span className="italic opacity-60">Sin contacto</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[9px] text-app-subtle">ID {s.id}</span>
                  <button
                    type="button"
                    title="Eliminar proveedor"
                    disabled={soloLectura || deleteSupplierMut.isPending}
                    onClick={async () => {
                      setSupplierErr('')
                      const ok = await confirm({ title: 'Eliminar proveedor', message: `¿Eliminar «${supplierLabel(s)}»?`, confirmLabel: 'Eliminar', tone: 'danger' })
                      if (!ok) return
                      deleteSupplierMut.mutate(s.id)
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-30 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Órdenes de compra ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <div className="flex items-center gap-2">
            <ChevronDown size={15} className="text-app-muted" />
            <h2 className="text-sm font-bold text-app-text">Órdenes de compra recientes</h2>
          </div>
          <span className="rounded-full bg-app-bg border border-app-border px-2.5 py-0.5 text-xs font-semibold text-app-muted">
            {(ordersQuery.data ?? []).length}
          </span>
        </div>

        {ordersQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-app-muted">Cargando…</div>
        ) : (ordersQuery.data ?? []).length === 0 ? (
          <p className="p-5 text-sm text-app-muted text-center">No hay órdenes registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-app-border bg-app-bg/50 text-[11px] font-semibold uppercase tracking-wider text-app-muted">
                  <th className="px-5 py-2.5">#</th>
                  <th className="px-5 py-2.5">Proveedor</th>
                  <th className="px-5 py-2.5">Referencia</th>
                  <th className="px-5 py-2.5 text-right">Líneas</th>
                  <th className="px-5 py-2.5">Fecha</th>
                  <th className="px-5 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {(ordersQuery.data ?? []).map((o) => (
                  <tr key={o.id} className="group border-b border-app-border/50 hover:bg-app-bg/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-app-muted">#{o.id}</td>
                    <td className="px-5 py-3 font-semibold text-app-text">{o.supplier_name}</td>
                    <td className="px-5 py-3 text-xs text-app-muted">{o.reference || '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-app-muted">{o.lines_count}</td>
                    <td className="px-5 py-3 text-xs text-app-muted">
                      {new Date(o.created_at).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        title="Eliminar orden y revertir inventario"
                        disabled={soloLectura || deleteOrderMut.isPending}
                        onClick={async () => {
                          setOrderErr('')
                          const ok = await confirm({ title: 'Eliminar orden', message: `¿Eliminar la orden #${o.id}? Se revertirá el stock.`, confirmLabel: 'Eliminar', tone: 'danger' })
                          if (!ok) return
                          deleteOrderMut.mutate(o.id)
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 disabled:opacity-30 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {orderErr ? (
          <div className="border-t border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">{orderErr}</div>
        ) : null}
      </div>
    </div>
  )
}
