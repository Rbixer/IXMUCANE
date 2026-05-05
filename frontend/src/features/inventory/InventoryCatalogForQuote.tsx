import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { DataTable } from '../../shared/ui/DataTable'
import type { InventoryItem } from '../../shared/types/domain'
import { formatHierarchyLabel, splitStockHierarchy } from '../../shared/lib/unitHierarchy'

const LOW_STOCK_THRESHOLD = 10

function stockHierarchyLabel(item: InventoryItem): string {
  const h = item.hierarchy
  if (h) return formatHierarchyLabel(h.fardos, h.paquetes, h.unidades)
  const { fardos, paquetes, unidades } = splitStockHierarchy(
    item.quantity,
    item.units_per_package ?? 1,
    item.packages_per_fardo ?? 1,
  )
  return formatHierarchyLabel(fardos, paquetes, unidades)
}

function unitsPerFardoFromItem(item: InventoryItem): number {
  const up = Math.max(1, item.units_per_package ?? 1)
  const pf = Math.max(1, item.packages_per_fardo ?? 1)
  return up * pf
}

type Props = {
  items: InventoryItem[]
  isLoading?: boolean
  onAdd: (item: InventoryItem) => void
}

/**
 * Vista tipo módulo Inventario (resumen + tabla) para cotizaciones: mismo estilo de columnas
 * y métricas; solo acción «Agregar» a la cotización (sin editar/eliminar catálogo).
 */
export function InventoryCatalogForQuote({ items, isLoading, onAdd }: Props) {
  const [inventorySearch, setInventorySearch] = useState('')

  const visibleRows = useMemo(() => {
    if (!inventorySearch.trim()) return items
    const q = inventorySearch.trim().toLowerCase()
    return items.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        (row.category_name ?? '').toLowerCase().includes(q),
    )
  }, [items, inventorySearch])

  const stats = useMemo(() => {
    return {
      total: items.length,
      conStock: items.filter((r) => r.quantity > 0).length,
      stockBajo: items.filter((r) => r.quantity > 0 && r.quantity <= LOW_STOCK_THRESHOLD).length,
      sinStock: items.filter((r) => r.quantity <= 0).length,
    }
  }, [items])

  const loading = Boolean(isLoading)

  return (
    <div className="mx-auto w-full max-w-[min(100%,68rem)] space-y-4">
      <div
        className="relative overflow-hidden rounded-2xl px-5 py-5 text-white sm:px-6"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, #DC2626 0%, transparent 60%)' }}
        />
        <div className="relative">
          <h2 className="text-lg font-black tracking-tight">INVENTARIO TIENDA</h2>
          <p className="mt-0.5 text-[13px] font-medium text-white/60">
            Misma vista que en Inventario: precios, stock y jerarquías. Elija filas con «Agregar» para la cotización.
          </p>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Productos</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-white">{loading ? '…' : stats.total}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Con stock</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-white">{loading ? '…' : stats.conStock}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Stock bajo</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums" style={{ color: '#FCD34D' }}>
              {loading ? '…' : stats.stockBajo}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Sin stock</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums" style={{ color: '#FCA5A5' }}>
              {loading ? '…' : stats.sinStock}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
          <p className="text-sm font-bold text-gray-600">
            {visibleRows.length} producto{visibleRows.length !== 1 ? 's' : ''}
            {inventorySearch ? ` · filtro: "${inventorySearch}"` : ''}
          </p>
          <div className="relative w-full max-w-xs">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              disabled={loading}
              placeholder="Buscar por nombre, SKU o categoría…"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:bg-white focus:ring-2 focus:ring-red-100 disabled:opacity-60"
            />
          </div>
        </div>

        <DataTable<InventoryItem>
          compact
          columns={[
            {
              key: 'display_order',
              label: '#',
              render: (item) => (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] font-black text-gray-600">
                  {item.display_order ?? '—'}
                </span>
              ),
            },
            {
              key: 'name',
              label: 'Producto',
              render: (item) => (
                <div className="min-w-[9rem]">
                  <span className="text-sm font-bold text-red-600">{item.name}</span>
                  <p className="mt-0.5 font-mono text-[10px] text-gray-400">SKU: {item.sku}</p>
                </div>
              ),
            },
            {
              key: 'categoria',
              label: 'Categoría',
              render: (item) => (
                <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">
                  {(item.category_name ?? '').trim() ? item.category_name : '—'}
                </span>
              ),
            },
            {
              key: 'units_per_package',
              label: 'U/paq',
              render: (item) => (
                <span className="tabular-nums font-bold text-gray-700">{Math.max(1, item.units_per_package ?? 1)}</span>
              ),
            },
            {
              key: 'units_per_fardo',
              label: 'U/fardo',
              render: (item) => (
                <span className="tabular-nums font-bold text-gray-700">{unitsPerFardoFromItem(item)}</span>
              ),
            },
            {
              key: 'cantidad',
              label: 'Stock',
              render: (item) => (
                <div className="flex flex-col">
                  <span className="tabular-nums text-sm font-black text-gray-900">{item.quantity}</span>
                  <span className="text-[10px] text-gray-400">{stockHierarchyLabel(item)}</span>
                </div>
              ),
            },
            {
              key: 'cost_price',
              label: 'Costo',
              render: (item) => (
                <span className="tabular-nums text-xs font-semibold text-gray-500">Q {item.cost_price ?? '0'}</span>
              ),
            },
            {
              key: 'unit_price',
              label: 'Precio venta',
              render: (item) => (
                <span className="tabular-nums font-black text-gray-900">Q {item.unit_price}</span>
              ),
            },
            {
              key: 'disponibilidad',
              label: 'Estado',
              render: (item) => {
                if (item.quantity <= 0) {
                  return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-black text-red-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      Sin stock
                    </span>
                  )
                }
                if (item.quantity <= LOW_STOCK_THRESHOLD) {
                  return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Stock bajo
                    </span>
                  )
                }
                return (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    En stock
                  </span>
                )
              },
            },
            {
              key: 'actions',
              label: 'Acciones',
              render: (item) => (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAdd(item)
                  }}
                  aria-label="Agregar a la cotización"
                  title="Agregar a la cotización"
                  disabled={loading}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-red-600 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={14} aria-hidden />
                  Agregar
                </button>
              ),
            },
          ]}
          rows={visibleRows}
          emptyMessage={loading ? 'Cargando inventario…' : 'No hay productos en este origen.'}
        />
      </div>
    </div>
  )
}
