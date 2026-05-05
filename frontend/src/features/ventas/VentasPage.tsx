import { Fragment, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Ellipsis,
  Minus,
  Package,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  User,
  UserCircle,
  X,
} from 'lucide-react'
import { listBranches } from '../branches/branches.service'
import { listInventory } from '../inventory/inventory.service'
import { pickPrimaryInventoryBranchId } from '../../shared/lib/defaultBranch'
import { SaleReceiptModal } from '../pos/SaleReceiptModal'
import { createPosSale, deletePosSale, listPosCustomers, listPosSales } from '../pos/pos.service'
import type { PaymentStatus, PosCustomer, PosSale, UnitKind } from '../pos/pos.service'
import { esPanelSoloLecturaEnModulo } from '../../shared/lib/accesoSesion'
import { formatHierarchyLabel, splitStockHierarchy } from '../../shared/lib/unitHierarchy'
import type { InventoryItem } from '../../shared/types/domain'
import { notifyError, notifySuccess } from '../../shared/lib/notify'
import { useConfirm } from '../../shared/ui/ConfirmProvider'

const PAYMENT_METHODS = [
  { key: 'cash'  as const, label: 'Efectivo', Icon: Banknote     },
  { key: 'card'  as const, label: 'Tarjeta',  Icon: CreditCard   },
  { key: 'other' as const, label: 'Otro',     Icon: Ellipsis     },
]

const fmtQ = (n: number) =>
  `Q ${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type LineDraft = {
  inventory_item: number
  quantity: number
  unit_kind: UnitKind
  unit_price: number   // precio por unidad-usuario (paq o fardo completo, no por base)
}

const UNIT_LABELS: Record<UnitKind, string> = { unit: 'Und', package: 'Paq', fardo: 'Fardo' }

function lineMultiplier(kind: UnitKind, upk: number, ppf: number): number {
  if (kind === 'fardo')   return Math.max(1, upk) * Math.max(1, ppf)
  if (kind === 'package') return Math.max(1, upk)
  return 1
}

function defaultPrice(it: InventoryItem, kind: UnitKind): number {
  const upk = Math.max(1, it.units_per_package ?? 1)
  const ppf = Math.max(1, it.packages_per_fardo ?? 1)
  if (kind === 'fardo') {
    const fp = Number(it.fardo_price ?? 0)
    return fp > 0 ? fp : Number(it.unit_price) * lineMultiplier('fardo', upk, ppf)
  }
  if (kind === 'package') {
    const pp = Number(it.package_price ?? 0)
    return pp > 0 ? pp : Number(it.unit_price) * lineMultiplier('package', upk, ppf)
  }
  return Number(it.unit_price)
}

function maxQtyForKind(it: InventoryItem, kind: UnitKind): number {
  const mult = lineMultiplier(kind, Math.max(1, it.units_per_package ?? 1), Math.max(1, it.packages_per_fardo ?? 1))
  return Math.max(0, Math.floor(it.quantity / mult))
}

function matchesQuery(it: InventoryItem, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return (
    it.name.toLowerCase().includes(t) ||
    it.sku.toLowerCase().includes(t) ||
    (it.category_name ?? '').toLowerCase().includes(t)
  )
}

function normBranchName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBodegaBranchName(name: string): boolean {
  return /\bbodega\b/i.test(name)
}

function bodegaSlotFromName(name: string): 1 | 2 | 3 | null {
  const raw = name.trim().toLowerCase()
  const strict = raw.match(/^bodega\s*([123])$/i)
  if (strict) {
    const x = Number(strict[1])
    return x === 1 || x === 2 || x === 3 ? (x as 1 | 2 | 3) : null
  }
  const n = normBranchName(name)
  for (const num of [1, 2, 3] as const) {
    if (new RegExp(`\\bbodega\\s*${num}\\b`).test(n)) return num
    if (n === `bodega${num}`) return num
  }
  return null
}

type InventoryBranchOption = { value: string; id: number; label: string; isTienda?: boolean }

export function VentasPage() {
  const { confirm } = useConfirm()
  const queryClient = useQueryClient()
  const soloLecturaPos = esPanelSoloLecturaEnModulo('pos')

  /* ── Estado del POS ───────────────────────────────────────────────────── */
  const [branchId, setBranchId] = useState<number>(0)
  const [lines, setLines] = useState<LineDraft[]>([])
  const [payment, setPayment] = useState<'cash' | 'card' | 'other'>('cash')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid')
  const [creditDays, setCreditDays] = useState<string>('30')
  const [creditNote, setCreditNote] = useState<string>('')
  const [discountInput, setDiscountInput] = useState<string>('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [formError, setFormError] = useState('')
  const [receiptSale, setReceiptSale] = useState<PosSale | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [inventoryScopeValue, setInventoryScopeValue] = useState('')
  const [seenItemsById, setSeenItemsById] = useState<Record<number, InventoryItem>>({})
  const [customerExpanded, setCustomerExpanded] = useState(false)
  const [showSales, setShowSales] = useState(false)

  const customerSuggestRef = useRef<HTMLDivElement>(null)
  const [customerDropOpen, setCustomerDropOpen] = useState(false)

  /* ── Queries ─────────────────────────────────────────────────────────── */
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: listBranches })

  const inventoryBranchOptions = useMemo<InventoryBranchOption[]>(() => {
    const branches = branchesQuery.data ?? []
    const valid = branches.filter((b) => b.id > 0)
    if (!valid.length) return []

    const tienda =
      valid.find((b) => !isBodegaBranchName(b.name) && normBranchName(b.name) === 'tienda') ??
      valid.find((b) => !isBodegaBranchName(b.name) && normBranchName(b.name).includes('tienda')) ??
      valid.find((b) => !isBodegaBranchName(b.name)) ??
      null

    const bodegas: Array<{ id: number; label: string }> = []
    for (const num of [1, 2, 3] as const) {
      const b = valid.find((x) => bodegaSlotFromName(x.name) === num)
      if (b) bodegas.push({ id: b.id, label: `Bodega ${num}` })
    }

    const out: InventoryBranchOption[] = []
    if (tienda) out.push({ value: 'tienda', id: tienda.id, label: 'Inventario tienda', isTienda: true })
    out.push(...bodegas.map((b) => ({ ...b, value: `branch-${b.id}` })))

    // Fallback mínimo si la detección no encontró nada con el nombre esperado.
    if (!out.length) {
      const id = pickPrimaryInventoryBranchId(valid)
      if (id != null && id > 0) out.push({ value: `branch-${id}`, id, label: 'Inventario' })
    }

    return out
  }, [branchesQuery.data])

  useEffect(() => {
    if (inventoryScopeValue) return
    const tiendaOpt = inventoryBranchOptions.find((o) => o.isTienda)
    const fallback = tiendaOpt ?? inventoryBranchOptions[0]
    if (!fallback) return
    setInventoryScopeValue(fallback.value)
    if (fallback.id > 0) setBranchId(fallback.id)
  }, [inventoryBranchOptions, inventoryScopeValue])

  const invQuery = useQuery({
    queryKey: ['inventory', 'ventas', inventoryScopeValue || branchId],
    queryFn: () => (inventoryScopeValue === 'tienda' ? listInventory() : branchId > 0 ? listInventory({ branch: branchId }) : listInventory()),
  })
  const salesQuery = useQuery({
    queryKey: ['pos', 'sales', branchId],
    queryFn: () => listPosSales(branchId > 0 ? branchId : undefined),
    enabled: showSales,
  })
  const customersQuery = useQuery({
    queryKey: ['pos', 'customers', customerSearch.trim().toLowerCase()],
    queryFn: () => listPosCustomers(customerSearch),
    staleTime: 30_000,
    enabled: customerSearch.trim().length > 0,
  })

  /* Cerrar dropdown cliente al clic fuera */
  useEffect(() => {
    if (!customerDropOpen) return
    const cb = (e: MouseEvent) => {
      if (customerSuggestRef.current?.contains(e.target as Node)) return
      setCustomerDropOpen(false)
    }
    document.addEventListener('mousedown', cb)
    return () => document.removeEventListener('mousedown', cb)
  }, [customerDropOpen])

  /* ── Cálculos ────────────────────────────────────────────────────────── */
  const tiendaBranchIds = useMemo(() => {
    const ids = new Set<number>()
    for (const b of branchesQuery.data ?? []) {
      if (b.id > 0 && !isBodegaBranchName(b.name)) ids.add(b.id)
    }
    return ids
  }, [branchesQuery.data])
  const allItems = invQuery.data ?? []
  const items = useMemo(
    () => (inventoryScopeValue === 'tienda' ? allItems.filter((it) => tiendaBranchIds.has(it.branch)) : allItems),
    [allItems, inventoryScopeValue, tiendaBranchIds],
  )
  useEffect(() => {
    if (items.length === 0) return
    setSeenItemsById((prev) => {
      const next = { ...prev }
      for (const it of items) next[it.id] = it
      return next
    })
  }, [items])
  const itemById = useMemo(() => {
    const m = new Map<number, InventoryItem>()
    for (const it of Object.values(seenItemsById)) m.set(it.id, it)
    for (const it of items) m.set(it.id, it)
    return m
  }, [seenItemsById, items])

  const filteredProducts = useMemo(() => {
    return items.filter((it) => matchesQuery(it, productSearch))
  }, [items, productSearch])

  const subtotalLines = useMemo(
    () => lines.reduce((sum, l) => sum + (Number.isFinite(l.unit_price) ? l.unit_price * l.quantity : 0), 0),
    [lines],
  )
  const discountAmount = useMemo(() => {
    const v = parseFloat(discountInput)
    return Number.isFinite(v) && v > 0 ? Math.min(v, subtotalLines) : 0
  }, [discountInput, subtotalLines])
  const estimatedTotal = useMemo(() => Math.max(0, subtotalLines - discountAmount), [subtotalLines, discountAmount])

  const totalUnits = useMemo(() => {
    return lines.reduce((a, l) => {
      const it = itemById.get(l.inventory_item)
      const mult = it ? lineMultiplier(l.unit_kind, Math.max(1, it.units_per_package ?? 1), Math.max(1, it.packages_per_fardo ?? 1)) : 1
      return a + l.quantity * mult
    }, 0)
  }, [lines, itemById])

  /* ── Mutaciones ──────────────────────────────────────────────────────── */
  const saleMutation = useMutation({
    mutationFn: createPosSale,
    onSuccess: (sale) => {
      setFormError('')
      setLines([])
      setCustomerName('')
      setCustomerPhone('')
      setCustomerEmail('')
      setCustomerAddress('')
      setCustomerSearch('')
      setSelectedCustomerId(null)
      setCustomerExpanded(false)
      setDiscountInput('')
      setPaymentStatus('paid')
      setCreditDays('30')
      setCreditNote('')
      setReceiptSale(sale)
      void queryClient.invalidateQueries({ queryKey: ['pos', 'sales'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
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
      ])
    },
    onError: (e: Error) => notifyError(e.message),
  })

  /* ── Handlers ────────────────────────────────────────────────────────── */
  const selectInventoryBranch = (nextValue: string) => {
    if (soloLecturaPos) return
    const next = inventoryBranchOptions.find((o) => o.value === nextValue)
    if (!next || next.id <= 0) return
    if (next.value === inventoryScopeValue && next.id === branchId) return
    setProductSearch('')
    setInventoryScopeValue(next.value)
    setBranchId(next.id)
  }

  const addProduct = (item: InventoryItem, qty = 1, kind: UnitKind = 'unit') => {
    const maxQ = maxQtyForKind(item, kind)
    if (maxQ <= 0) return
    const q = Math.max(1, Math.min(Math.floor(qty) || 1, maxQ))
    setLines((prev) => {
      const ix = prev.findIndex((l) => l.inventory_item === item.id && l.unit_kind === kind)
      if (ix >= 0) {
        return prev.map((l, i) =>
          i !== ix ? l : { ...l, quantity: Math.min(maxQ, l.quantity + q) },
        )
      }
      return [...prev, {
        inventory_item: item.id,
        quantity: q,
        unit_kind: kind,
        unit_price: defaultPrice(item, kind),
      }]
    })
  }

  const setQty = (index: number, raw: number) => {
    setLines((prev) => {
      const row = prev[index]
      if (!row) return prev
      const it = itemById.get(row.inventory_item)
      if (!it) return prev
      const maxQ = maxQtyForKind(it, row.unit_kind)
      const q = Math.max(1, Math.min(Math.floor(raw) || 1, maxQ))
      return prev.map((l, i) => (i === index ? { ...l, quantity: q } : l))
    })
  }

  const setUnitKind = (index: number, kind: UnitKind) => {
    setLines((prev) => {
      const row = prev[index]
      if (!row) return prev
      const it = itemById.get(row.inventory_item)
      if (!it) return prev
      const maxQ = maxQtyForKind(it, kind)
      if (maxQ <= 0) return prev
      const newQty = Math.min(row.quantity, maxQ)
      return prev.map((l, i) =>
        i !== index ? l : { ...l, unit_kind: kind, quantity: newQty, unit_price: defaultPrice(it, kind) },
      )
    })
  }

  const setLinePrice = (index: number, raw: string) => {
    const n = parseFloat(raw.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, unit_price: n } : l)))
  }

  const incQty = (index: number) => {
    const row = lines[index]
    if (!row) return
    const it = itemById.get(row.inventory_item)
    if (!it) return
    setQty(index, row.quantity + 1)
  }

  const decQty = (index: number) => {
    const row = lines[index]
    if (!row) return
    if (row.quantity <= 1) { setLines((p) => p.filter((_, i) => i !== index)); return }
    setQty(index, row.quantity - 1)
  }

  const onPickCustomer = (c: PosCustomer) => {
    setSelectedCustomerId(c.id)
    setCustomerSearch(c.name)
    setCustomerName(c.name || '')
    setCustomerPhone(c.phone || '')
    setCustomerEmail(c.email || '')
    setCustomerAddress(c.address || '')
    setCustomerDropOpen(false)
    setCustomerExpanded(true)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (soloLecturaPos) { setFormError('Sin permiso de módulo POS.'); return }
    if (branchId <= 0)  { setFormError('No hay inventario configurado.'); return }
    if (!lines.length)  { setFormError('Agregue al menos un producto.'); return }
    saleMutation.mutate({
      branch: branchId,
      customer: selectedCustomerId,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_email: customerEmail.trim(),
      customer_address: customerAddress.trim(),
      payment_method: payment,
      payment_status: paymentStatus,
      credit_days: paymentStatus === 'credit' ? Math.max(0, Number(creditDays) || 0) : 0,
      credit_note: (paymentStatus === 'credit' || paymentStatus === 'pending') ? creditNote.trim() : '',
      discount: discountAmount > 0 ? discountAmount : undefined,
      lines: lines.map((l) => ({
        inventory_item: l.inventory_item,
        quantity: Math.max(1, Math.floor(l.quantity) || 1),
        unit_kind: l.unit_kind,
        unit_price: String(l.unit_price),
      })),
    })
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <Fragment>
      <SaleReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />

      {soloLecturaPos ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Solo puede <strong>consultar</strong> ventas. Un administrador debe asignarle el permiso POS para registrar.
        </div>
      ) : null}

      {/* ── Layout 2 columnas ─────────────────────────────────────────── */}
      <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4 lg:flex-row lg:items-start">

        {/* ═══ PANEL IZQUIERDO — Catálogo ═══════════════════════════════ */}
        <div className="flex flex-col gap-4 lg:flex-1">

          {/* Búsqueda */}
          <div className="rounded-2xl border border-app-border bg-app-surface shadow-card">
            <div className="flex items-center gap-3 border-b border-app-border px-4 py-3">
              <Search size={16} className="shrink-0 text-app-muted" aria-hidden />
              <input
                type="search"
                autoComplete="off"
                placeholder="Buscar por nombre, SKU o categoría…"
                value={productSearch}
                disabled={invQuery.isLoading || soloLecturaPos}
                onChange={(e) => setProductSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-app-text placeholder:text-app-subtle outline-none"
              />
              {inventoryBranchOptions.length > 0 ? (
                <select
                  value={inventoryScopeValue}
                  disabled={invQuery.isLoading || soloLecturaPos}
                  onChange={(e) => void selectInventoryBranch(e.target.value)}
                  className="h-9 shrink-0 rounded-lg border border-app-border bg-app-bg px-2 text-sm font-semibold text-app-text outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Seleccionar inventario"
                >
                  <option value="" disabled>
                    Inventario
                  </option>
                  {inventoryBranchOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : null}
              {productSearch ? (
                <button
                  type="button"
                  onClick={() => setProductSearch('')}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-app-bg text-app-muted hover:text-app-text"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>

            {/* Stats rápidas */}
            {!invQuery.isLoading && items.length > 0 ? (
              <div className="flex items-center gap-4 border-b border-app-border px-4 py-2 text-[11px] text-app-muted">
                <span>{items.length} productos</span>
                <span>·</span>
                <span>{filteredProducts.length} mostrados</span>
                {productSearch ? (
                  <Fragment>
                    <span>·</span>
                    <span className="text-brand-600">filtrando por "{productSearch}"</span>
                  </Fragment>
                ) : null}
                <span className="ml-auto">
                  Inventario:{' '}
                  <Link to="/inventario/productos" className="font-semibold text-brand-600 hover:underline">
                    ver
                  </Link>
                </span>
              </div>
            ) : null}

            {/* Grid de productos */}
            <div className="p-3">
              {invQuery.isLoading ? (
                <div className="flex h-48 items-center justify-center text-sm text-app-muted">
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-app-border border-t-brand-500" />
                    Cargando catálogo…
                  </span>
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-app-border text-sm text-app-muted">
                  <Package size={28} className="text-app-subtle" />
                  <p>No hay productos disponibles</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-app-border text-sm text-app-muted">
                  <Search size={22} className="text-app-subtle" />
                  <p>Sin resultados para "{productSearch}"</p>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredProducts.map((it) => {
                    const { fardos, paquetes, unidades } = splitStockHierarchy(
                      it.quantity, it.units_per_package ?? 1, it.packages_per_fardo ?? 1,
                    )
                    const stockLabel = formatHierarchyLabel(fardos, paquetes, unidades)
                    const outOfStock = it.quantity <= 0
                    const cartLines = lines.filter((l) => l.inventory_item === it.id)
                    const inCart = cartLines.length > 0

                    const upPrice  = Number(it.unit_price)
                    const paqPrice = Number(it.package_price ?? 0)
                    const farPrice = Number(it.fardo_price ?? 0)
                    const hasPaq   = maxQtyForKind(it, 'package') > 0
                    const hasFardo = maxQtyForKind(it, 'fardo') > 0

                    return (
                      <div
                        key={it.id}
                        className={[
                          'relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all duration-150',
                          outOfStock
                            ? 'border-app-border bg-app-bg opacity-50'
                            : inCart
                              ? 'border-brand-200 bg-brand-50/60 shadow-sm'
                              : 'border-app-border bg-app-surface hover:border-app-border-strong hover:shadow-card',
                        ].join(' ')}
                      >
                        {/* Indicadores en carrito */}
                        {inCart ? (
                          <span className="absolute right-2 top-2 rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            {cartLines.reduce((s, l) => s + l.quantity, 0)} en orden
                          </span>
                        ) : null}

                        {/* SKU + Nombre */}
                        <span className="font-mono text-[10px] text-app-subtle">{it.sku}</span>
                        <span className={[
                          'line-clamp-2 text-[13px] font-semibold leading-snug',
                          outOfStock ? 'text-app-muted' : 'text-app-text',
                        ].join(' ')}>
                          {it.name}
                        </span>
                        {it.category_name ? (
                          <span className="truncate text-[10px] text-app-muted">{it.category_name}</span>
                        ) : null}

                        {/* Stock */}
                        <p className={['text-[10px] tabular-nums', outOfStock ? 'font-semibold text-red-600' : 'text-app-muted'].join(' ')}>
                          Stock: {outOfStock ? 'Sin stock' : stockLabel}
                        </p>

                        {/* Botones de precio por tipo */}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {/* Unidad */}
                          <button
                            type="button"
                            disabled={soloLecturaPos || outOfStock}
                            onClick={() => addProduct(it, 1, 'unit')}
                            className="flex flex-col items-start rounded-lg border border-app-border bg-app-bg px-2 py-1.5 transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40"
                          >
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-app-muted">Und</span>
                            <span className="text-[11px] font-bold tabular-nums text-app-text">{fmtQ(upPrice)}</span>
                          </button>

                          {/* Paquete */}
                          {hasPaq ? (
                            <button
                              type="button"
                              disabled={soloLecturaPos || outOfStock}
                              onClick={() => addProduct(it, 1, 'package')}
                              className="flex flex-col items-start rounded-lg border border-app-border bg-app-bg px-2 py-1.5 transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-40"
                            >
                              <span className="text-[9px] font-semibold uppercase tracking-wide text-app-muted">Paq ×{it.units_per_package}</span>
                              <span className="text-[11px] font-bold tabular-nums text-app-text">
                                {fmtQ(paqPrice > 0 ? paqPrice : upPrice * Math.max(1, it.units_per_package ?? 1))}
                              </span>
                            </button>
                          ) : null}

                          {/* Fardo */}
                          {hasFardo ? (
                            <button
                              type="button"
                              disabled={soloLecturaPos || outOfStock}
                              onClick={() => addProduct(it, 1, 'fardo')}
                              className="flex flex-col items-start rounded-lg border border-app-border bg-app-bg px-2 py-1.5 transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-40"
                            >
                              <span className="text-[9px] font-semibold uppercase tracking-wide text-app-muted">
                                Fardo ×{(it.units_per_package ?? 1) * (it.packages_per_fardo ?? 1)}
                              </span>
                              <span className="text-[11px] font-bold tabular-nums text-app-text">
                                {fmtQ(farPrice > 0 ? farPrice : upPrice * Math.max(1, (it.units_per_package ?? 1) * (it.packages_per_fardo ?? 1)))}
                              </span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ─ Historial de ventas (plegable) ─────────────────────────── */}
          <div className="rounded-2xl border border-app-border bg-app-surface shadow-card">
            <button
              type="button"
              onClick={() => setShowSales((o) => !o)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4"
            >
              <div className="flex items-center gap-2">
                <ReceiptText size={16} className="text-app-muted" aria-hidden />
                <span className="text-sm font-semibold text-app-text">Historial de ventas</span>
              </div>
              <ChevronDown
                size={16}
                className={`text-app-muted transition-transform duration-200 ${showSales ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            {showSales ? (
              <div className="border-t border-app-border px-5 pb-5">
                {salesQuery.isLoading ? (
                  <p className="py-4 text-center text-sm text-app-muted">Cargando…</p>
                ) : salesQuery.isError ? (
                  <p className="py-4 text-center text-sm text-brand-600">No se pudo cargar el historial.</p>
                ) : (salesQuery.data ?? []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-app-muted">No hay ventas registradas aún.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="mt-3 w-full min-w-[36rem] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-app-border text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                          <th className="pb-2 pr-4">#</th>
                          <th className="pb-2 pr-4">Cliente</th>
                          <th className="pb-2 pr-4">Pago</th>
                          <th className="pb-2 pr-4 text-right">Productos</th>
                          <th className="pb-2 pr-4 text-right">Uds.</th>
                          <th className="pb-2 pr-4 text-right">Total</th>
                          <th className="pb-2 pr-4">Fecha</th>
                          <th className="pb-2 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {(salesQuery.data ?? []).map((s) => {
                          const pm = PAYMENT_METHODS.find((p) => p.key === s.payment_method)
                          return (
                            <tr
                              key={s.id}
                              className="group border-b border-app-border/50 transition-colors hover:bg-app-bg/60"
                            >
                              <td className="py-3 pr-4 font-mono text-xs text-app-muted">#{s.id}</td>
                              <td className="py-3 pr-4">
                                <span className="truncate text-sm font-medium text-app-text">
                                  {s.customer_name || <span className="text-app-muted italic">Consumidor final</span>}
                                </span>
                              </td>
                              <td className="py-3 pr-4">
                                <span className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-bg px-2 py-0.5 text-[11px] font-medium text-app-muted">
                                  {pm ? <pm.Icon size={11} aria-hidden /> : null}
                                  {pm?.label ?? s.payment_method}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-right tabular-nums text-app-muted">{s.lines_count}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-app-muted">{s.total_units}</td>
                              <td className="py-3 pr-4 text-right font-semibold tabular-nums text-app-text">
                                Q {s.total}
                              </td>
                              <td className="py-3 pr-4 text-xs text-app-muted">
                                {new Date(s.created_at).toLocaleString('es-GT', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </td>
                              <td className="py-3">
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
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 text-red-500 opacity-0 transition-all hover:bg-red-50 group-hover:opacity-100 disabled:opacity-30"
                                >
                                  <Trash2 size={13} aria-hidden />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* ═══ PANEL DERECHO — Orden ════════════════════════════════════ */}
        <form
          onSubmit={submit}
          className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-card lg:w-[22rem] lg:sticky lg:top-[4.5rem] xl:w-[24rem]"
        >
          {/* Header del panel de orden */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{
              background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
            }}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Nueva venta</p>
              <p className="mt-0.5 text-base font-bold text-white">
                {lines.length === 0 ? 'Orden vacía' : `${lines.length} producto${lines.length > 1 ? 's' : ''}`}
              </p>
            </div>
            {lines.length > 0 ? (
              <button
                type="button"
                onClick={() => setLines([])}
                className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/8 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/14"
              >
                <X size={12} />
                Limpiar
              </button>
            ) : null}
          </div>

          {/* Líneas de la orden */}
          <div className="min-h-[12rem] flex-1 overflow-y-auto">
            {lines.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 px-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-bg">
                  <Package size={24} className="text-app-subtle" />
                </div>
                <div>
                  <p className="text-sm font-medium text-app-text">Sin productos</p>
                  <p className="mt-0.5 text-xs text-app-muted">Haz clic en un producto para añadirlo</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-app-border/50">
                {lines.map((line, idx) => {
                  const it = itemById.get(line.inventory_item)
                  if (!it) return null
                  const sub = Number.isFinite(line.unit_price) ? line.unit_price * line.quantity : 0
                  const maxQ = maxQtyForKind(it, line.unit_kind)
                  const kinds: UnitKind[] = ['unit', 'package', 'fardo']
                  return (
                    <li key={`${line.inventory_item}-${line.unit_kind}`} className="px-4 py-3 space-y-2">
                      {/* Fila superior: SKU + nombre + borrar */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-app-subtle">{it.sku}</p>
                          <p className="line-clamp-1 text-xs font-semibold text-app-text">{it.name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                          className="shrink-0 flex h-5 w-5 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition"
                        >
                          <X size={11} strokeWidth={2.5} />
                        </button>
                      </div>

                      {/* Fila de controles: tipo | cantidad | precio | subtotal */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Selector de tipo */}
                        <div className="flex rounded-lg border border-app-border overflow-hidden">
                          {kinds.map((k) => {
                            const avail = maxQtyForKind(it, k) > 0
                            return (
                              <button
                                key={k}
                                type="button"
                                disabled={!avail}
                                onClick={() => setUnitKind(idx, k)}
                                className={[
                                  'px-2 py-1 text-[10px] font-bold transition',
                                  line.unit_kind === k
                                    ? k === 'unit'    ? 'bg-brand-500 text-white'
                                      : k === 'package' ? 'bg-violet-500 text-white'
                                      : 'bg-amber-500 text-white'
                                    : 'bg-app-bg text-app-muted hover:text-app-text disabled:opacity-30',
                                ].join(' ')}
                              >
                                {UNIT_LABELS[k]}
                              </button>
                            )
                          })}
                        </div>

                        {/* Cantidad */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => decQty(idx)}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-app-border bg-app-bg text-app-muted hover:text-app-text transition"
                          >
                            <Minus size={10} strokeWidth={2.5} />
                          </button>
                          <span className="w-7 text-center text-xs font-bold tabular-nums text-app-text">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => incQty(idx)}
                            disabled={line.quantity >= maxQ}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-app-border bg-app-bg text-app-muted hover:text-app-text disabled:opacity-30 transition"
                          >
                            <Plus size={10} strokeWidth={2.5} />
                          </button>
                        </div>

                        {/* Precio editable */}
                        <div className="flex items-center gap-1 rounded-lg border border-app-border bg-app-bg px-2 py-1">
                          <span className="text-[10px] text-app-muted">Q</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => setLinePrice(idx, e.target.value)}
                            className="w-16 bg-transparent text-xs font-semibold tabular-nums text-app-text outline-none"
                          />
                        </div>

                        {/* Subtotal */}
                        <span className="ml-auto text-sm font-bold tabular-nums text-app-text">
                          {fmtQ(sub)}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Resumen numérico */}
          {lines.length > 0 ? (
            <div className="border-t border-app-border px-4 py-2.5 text-xs">
              <div className="flex items-center justify-between text-app-muted">
                <span>{lines.length} línea{lines.length > 1 ? 's' : ''} · {totalUnits} u. en stock</span>
                <span className="tabular-nums font-semibold text-app-text">{fmtQ(estimatedTotal)}</span>
              </div>
            </div>
          ) : null}

          {/* Separador */}
          <div className="border-t border-app-border" />

          {/* Método de pago */}
          <div className="px-5 py-4">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-app-muted">
              Método de pago
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  disabled={soloLecturaPos}
                  onClick={() => setPayment(key)}
                  className={[
                    'flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition-all duration-150',
                    payment === key
                      ? 'border-brand-300 bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-200'
                      : 'border-app-border bg-app-bg text-app-muted hover:border-app-border-strong hover:bg-app-surface hover:text-app-text',
                  ].join(' ')}
                >
                  <Icon
                    size={18}
                    className={payment === key ? 'text-brand-600' : 'text-app-subtle'}
                    aria-hidden
                  />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Estado de pago ────────────────────────────────────────── */}
          <div className="border-t border-app-border px-5 py-4">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-app-muted">
              Estado de pago
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'paid'    as PaymentStatus, label: 'Pagado',   Icon: CheckCircle2, active: 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', activeIcon: 'text-emerald-600' },
                { key: 'credit'  as PaymentStatus, label: 'Crédito',  Icon: CreditCard,   active: 'border-blue-300 bg-blue-50 text-blue-700 ring-1 ring-blue-200',             activeIcon: 'text-blue-600'    },
                { key: 'pending' as PaymentStatus, label: 'Pendiente', Icon: Clock,        active: 'border-amber-300 bg-amber-50 text-amber-700 ring-1 ring-amber-200',         activeIcon: 'text-amber-600'   },
              ] as const).map(({ key, label, Icon, active, activeIcon }) => (
                <button
                  key={key}
                  type="button"
                  disabled={soloLecturaPos}
                  onClick={() => setPaymentStatus(key)}
                  className={[
                    'flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition-all duration-150',
                    paymentStatus === key
                      ? active
                      : 'border-app-border bg-app-bg text-app-muted hover:border-app-border-strong hover:bg-app-surface hover:text-app-text',
                  ].join(' ')}
                >
                  <Icon size={17} className={paymentStatus === key ? activeIcon : 'text-app-subtle'} aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            {/* Campos extra para crédito / pendiente */}
            {(paymentStatus === 'credit' || paymentStatus === 'pending') ? (
              <div className="mt-3 space-y-2">
                {paymentStatus === 'credit' ? (
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-app-muted">
                      Plazo (días)
                    </span>
                    <div className="mt-1 flex items-center gap-2 rounded-xl border border-app-border bg-app-bg px-3 py-2">
                      <Clock size={13} className="shrink-0 text-blue-400" aria-hidden />
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={creditDays}
                        onChange={(e) => setCreditDays(e.target.value)}
                        className="flex-1 bg-transparent text-sm font-semibold text-app-text outline-none"
                        placeholder="30"
                      />
                      <span className="text-xs text-app-muted">días</span>
                    </div>
                  </label>
                ) : null}
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-app-muted">
                    Nota de crédito (opcional)
                  </span>
                  <div className="mt-1 flex items-start gap-2 rounded-xl border border-app-border bg-app-bg px-3 py-2">
                    <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
                    <textarea
                      rows={2}
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      className="flex-1 resize-none bg-transparent text-sm text-app-text outline-none placeholder:text-app-subtle"
                      placeholder="Ej: Pago acordado para el viernes…"
                    />
                  </div>
                </label>
              </div>
            ) : null}
          </div>

          {/* Cliente (colapsable) */}
          <div className="border-t border-app-border">
            <button
              type="button"
              onClick={() => setCustomerExpanded((o) => !o)}
              className="flex w-full items-center justify-between px-5 py-3"
            >
              <div className="flex items-center gap-2">
                <UserCircle
                  size={15}
                  className={customerName ? 'text-brand-500' : 'text-app-muted'}
                  aria-hidden
                />
                <span className="text-xs font-semibold text-app-text">
                  {customerName ? customerName : 'Cliente (opcional)'}
                </span>
                {customerName ? (
                  <CheckCircle2 size={13} className="text-emerald-500" aria-hidden />
                ) : null}
              </div>
              <ChevronDown
                size={14}
                className={`text-app-muted transition-transform duration-200 ${customerExpanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            {customerExpanded ? (
              <div className="border-t border-app-border px-5 pb-4 pt-3">
                {/* Búsqueda de cliente */}
                <div ref={customerSuggestRef} className="relative mb-3">
                  <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-bg px-3 py-2">
                    <User size={13} className="shrink-0 text-app-subtle" aria-hidden />
                    <input
                      className="flex-1 bg-transparent text-sm text-app-text placeholder:text-app-subtle outline-none"
                      placeholder="Buscar cliente existente…"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value)
                        setSelectedCustomerId(null)
                        setCustomerDropOpen(true)
                      }}
                      onFocus={() => customerSearch.trim() && setCustomerDropOpen(true)}
                    />
                    {customerSearch ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerSearch('')
                          setSelectedCustomerId(null)
                          setCustomerName('')
                          setCustomerPhone('')
                          setCustomerEmail('')
                          setCustomerAddress('')
                        }}
                        className="text-app-subtle hover:text-app-text"
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>

                  {customerDropOpen && customerSearch.trim() && (customersQuery.data ?? []).length > 0 ? (
                    <div className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-app-border bg-white shadow-modal">
                      {(customersQuery.data ?? []).slice(0, 8).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onPickCustomer(c)}
                          className="flex w-full items-start gap-2.5 border-b border-app-border/50 px-3 py-2.5 text-left transition last:border-0 hover:bg-app-bg"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                            {c.name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-app-text">{c.name}</p>
                            <p className="text-xs text-app-muted">{c.phone || c.email || 'Sin contacto'}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Campos del cliente */}
                <div className="space-y-2">
                  {[
                    { ph: 'Nombre completo',    val: customerName,    set: setCustomerName    },
                    { ph: 'Teléfono',           val: customerPhone,   set: setCustomerPhone   },
                    { ph: 'Correo electrónico', val: customerEmail,   set: setCustomerEmail   },
                    { ph: 'Dirección',          val: customerAddress, set: setCustomerAddress },
                  ].map(({ ph, val, set }) => (
                    <input
                      key={ph}
                      className="input-base py-2 text-xs"
                      placeholder={ph}
                      value={val}
                      onChange={(e) => set(e.target.value)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Error */}
          {formError ? (
            <div className="border-t border-red-100 bg-red-50 px-5 py-2.5 text-xs font-medium text-red-700">
              {formError}
            </div>
          ) : null}

          {/* Total + botón de cobro */}
          <div className="border-t border-app-border p-5">
            {/* Descuento */}
            {lines.length > 0 ? (
              <div className="mb-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-app-muted">
                    Descuento (Q)
                  </span>
                  <div className="mt-1 flex items-center gap-2 rounded-xl border border-app-border bg-app-bg px-3 py-2">
                    <span className="text-xs font-bold text-app-muted">Q</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      className="flex-1 bg-transparent text-sm font-semibold text-app-text outline-none"
                      placeholder="0.00"
                    />
                    {discountAmount > 0 ? (
                      <button type="button" onClick={() => setDiscountInput('')}
                        className="text-xs font-bold text-red-400 hover:text-red-600">✕</button>
                    ) : null}
                  </div>
                </label>
              </div>
            ) : null}

            <div className="mb-4 space-y-1">
              {discountAmount > 0 ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-semibold text-app-muted">Subtotal</span>
                    <span className="text-sm font-bold tabular-nums text-app-text">{fmtQ(subtotalLines)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-semibold text-emerald-600">Descuento</span>
                    <span className="text-sm font-bold tabular-nums text-emerald-600">- {fmtQ(discountAmount)}</span>
                  </div>
                  <div className="mt-1 border-t border-app-border pt-1" />
                </>
              ) : null}
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-app-muted">Total</span>
                <span
                  className="text-3xl font-bold tabular-nums tracking-tight"
                  style={{
                    background: lines.length > 0
                      ? 'linear-gradient(90deg, #DC2626, #F59E0B)'
                      : undefined,
                    WebkitBackgroundClip: lines.length > 0 ? 'text' : undefined,
                    WebkitTextFillColor: lines.length > 0 ? 'transparent' : undefined,
                    color: lines.length === 0 ? '#9AA1B4' : undefined,
                  }}
                >
                  {fmtQ(estimatedTotal)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={soloLecturaPos || saleMutation.isPending || branchId <= 0 || lines.length === 0}
              className="btn-primary w-full py-3.5 text-base font-bold disabled:opacity-50"
            >
              {saleMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Registrando venta…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={18} />
                  Cobrar {lines.length > 0 ? fmtQ(estimatedTotal) : ''}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </Fragment>
  )
}
