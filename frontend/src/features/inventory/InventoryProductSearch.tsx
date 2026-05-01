import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { InventoryItem } from '../../shared/types/domain'
import { formatHierarchyLabel, splitStockHierarchy } from '../../shared/lib/unitHierarchy'

function PosSearchRowWithQty({
  it,
  disabled,
  addLabel,
  onAdd,
}: {
  it: InventoryItem
  disabled?: boolean
  addLabel: string
  onAdd: (item: InventoryItem, quantity: number) => void
}) {
  const maxStock = Math.max(0, it.quantity)
  const [qty, setQty] = useState(1)
  const noDisponible = maxStock <= 0

  useEffect(() => {
    setQty((q) => {
      if (maxStock <= 0) return 1
      return Math.min(Math.max(1, q), maxStock)
    })
  }, [maxStock, it.id])

  const clamped = maxStock > 0 ? Math.min(Math.max(1, Math.floor(qty) || 1), maxStock) : 1

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-transparent bg-white px-2 py-1.5 text-xs hover:border-slate-200">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[10px] text-slate-500">{it.sku}</span>
        <div className="truncate font-medium text-slate-900">{it.name}</div>
        {it.category_name ? (
          <div className="truncate text-[10px] text-slate-500">{it.category_name}</div>
        ) : null}
        <div className="text-[10px] text-slate-600">
          Stock máx. {maxStock} u. · P. unit. Q{it.unit_price}
          {noDisponible ? <span className="ml-1 font-semibold text-red-700">· No disponible</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <label className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-semibold uppercase text-slate-500">Cant.</span>
          <input
            type="number"
            min={maxStock > 0 ? 1 : 0}
            max={maxStock > 0 ? maxStock : 0}
            disabled={disabled || noDisponible}
            value={noDisponible ? 0 : qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="w-14 rounded border border-slate-300 px-1 py-1 text-center text-[11px] tabular-nums disabled:bg-slate-100"
          />
        </label>
        <button
          type="button"
          disabled={disabled || noDisponible}
          title={noDisponible ? 'No disponible (stock 0)' : 'Añadir a la venta'}
          onClick={() => {
            onAdd(it, clamped)
            setQty(1)
          }}
          className="self-end rounded-md bg-boutique-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-boutique-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {addLabel}
        </button>
      </div>
    </li>
  )
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

/** Panel de búsqueda + lista para añadir productos (POS u orden de compra / recepción). */
export function ProductSearchAddPanel({
  items,
  disabled,
  onAdd,
  purpose = 'pos',
  title,
  addButtonLabel,
  headingClassName,
  /** POS: cantidad por fila antes de pulsar Añadir. Recepción: suele omitirse. */
  showQuantityBeforeAdd = false,
}: {
  items: InventoryItem[]
  disabled?: boolean
  onAdd: (item: InventoryItem, quantity?: number) => void
  /** `pos`: no añadir si stock 0. `purchase`: recepción, siempre se puede elegir. */
  purpose?: 'pos' | 'purchase'
  title?: string
  addButtonLabel?: string
  /** Si se omite, el título se muestra en mayúsculas pequeñas (estilo POS). */
  headingClassName?: string
  showQuantityBeforeAdd?: boolean
}) {
  const [q, setQ] = useState('')
  const requirePositiveStock = purpose === 'pos'
  const heading =
    title ??
    (purpose === 'purchase' ? 'Buscar producto (recepción)' : 'Buscar producto')
  const addLabel = addButtonLabel ?? (purpose === 'purchase' ? 'Añadir a la orden' : 'Añadir')

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = t ? items.filter((it) => matchesQuery(it, t)) : items
    // Sin texto: limitar para rendimiento. Con búsqueda: mostrar todas las coincidencias.
    return t ? list : list.slice(0, 100)
  }, [items, q])

  const headingRowClass =
    headingClassName ?? 'text-xs font-semibold uppercase tracking-wide text-slate-600'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className={`mb-2 flex items-center gap-2 ${headingRowClass}`}>
        <Search size={14} aria-hidden className="shrink-0 text-slate-500" />
        {heading}
      </div>
      <input
        type="search"
        autoComplete="off"
        placeholder="Nombre, SKU o categoría…"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-boutique-500/30 focus:border-boutique-500 focus:ring-2 disabled:bg-slate-100"
      />
      <p className="mb-1.5 text-[10px] text-slate-500">
        {q.trim() ? `${filtered.length} coincidencia(s)` : `${items.length} producto(s) — escriba para filtrar`}
      </p>
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-100 bg-slate-50/80 p-1">
        {filtered.length === 0 ? (
          <li className="px-2 py-3 text-center text-xs text-slate-500">Sin resultados.</li>
        ) : showQuantityBeforeAdd && purpose === 'pos' ? (
          filtered.map((it) => (
            <PosSearchRowWithQty
              key={it.id}
              it={it}
              disabled={disabled}
              addLabel={addLabel}
              onAdd={(item, quantity) => onAdd(item, quantity)}
            />
          ))
        ) : (
          filtered.map((it) => {
            const { fardos, paquetes, unidades } = splitStockHierarchy(
              it.quantity,
              it.units_per_package ?? 1,
              it.packages_per_fardo ?? 1,
            )
            const j = formatHierarchyLabel(fardos, paquetes, unidades)
            return (
              <li
                key={it.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-transparent bg-white px-2 py-1.5 text-xs hover:border-slate-200"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[10px] text-slate-500">{it.sku}</span>
                  <div className="truncate font-medium text-slate-900">{it.name}</div>
                  {it.category_name ? (
                    <div className="truncate text-[10px] text-slate-500">{it.category_name}</div>
                  ) : null}
                  <div className="text-[10px] text-slate-600">
                    Stock {j} · Q{it.unit_price}
                    {it.quantity <= 0 ? <span className="ml-1 font-semibold text-red-700">· No disponible</span> : null}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={disabled || (requirePositiveStock && it.quantity <= 0)}
                  title={
                    requirePositiveStock && it.quantity <= 0
                      ? 'No disponible (stock 0)'
                      : purpose === 'purchase'
                        ? 'Añadir línea de recepción'
                        : 'Añadir a la venta'
                  }
                  onClick={() => onAdd(it, 1)}
                  className="shrink-0 rounded-md bg-boutique-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-boutique-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {addLabel}
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

/** Autocompletado por línea (órdenes de compra): buscar y elegir un producto del inventario. */
export function LineProductAutocomplete({
  itemId,
  items,
  disabled,
  onPick,
}: {
  itemId: number
  items: InventoryItem[]
  disabled?: boolean
  onPick: (id: number) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = items.find((i) => i.id === itemId)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 1) return []
    return items.filter((it) => matchesQuery(it, t)).slice(0, 40)
  }, [items, q])

  useEffect(() => {
    if (!open) return
    const onDoc = (ev: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <label className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-500">Producto</label>
      {selected ? (
        <p className="mb-1 truncate text-xs text-slate-800">
          <span className="font-mono text-slate-500">{selected.sku}</span> — {selected.name}
        </p>
      ) : null}
      <div className="relative">
        <input
          type="search"
          autoComplete="off"
          placeholder="Escriba para buscar (nombre, SKU, categoría)…"
          value={q}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-boutique-500 focus:ring-1 focus:ring-boutique-500 disabled:bg-slate-100"
        />
        {open && !disabled && q.trim() ? (
          <ul className="absolute z-20 mt-0.5 max-h-40 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-0.5 shadow-lg">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-xs text-slate-500">Sin coincidencias.</li>
            ) : null}
            {filtered.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-slate-100"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(it.id)
                    setQ('')
                    setOpen(false)
                  }}
                >
                  <span className="font-mono text-[10px] text-slate-500">{it.sku}</span>
                  <div className="truncate font-medium">{it.name}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
