import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listBranches } from '../branches/branches.service'
import { esModoPanelSoloSeleccion, panelTieneModuloEscritura } from '../../shared/lib/accesoSesion'

type BodegaSlot = { slot: 1 | 2 | 3; branchId: number | null; branchName: string }

function bodegaSlotFromName(name: string): 1 | 2 | 3 | null {
  const m = name.trim().toLowerCase().match(/^bodega\s*([123])$/)
  if (!m) return null
  const n = Number(m[1])
  return n === 1 || n === 2 || n === 3 ? n : null
}

function pickBodegaSlots(branches: { id: number; name: string }[]): BodegaSlot[] {
  const bySlot = new Map<1 | 2 | 3, { id: number; name: string }>()
  for (const b of branches) {
    if (b.id <= 0) continue
    const slot = bodegaSlotFromName(b.name)
    if (slot != null) bySlot.set(slot, b)
  }
  const slots: BodegaSlot[] = []
  for (const slot of [1, 2, 3] as const) {
    const selected = bySlot.get(slot) ?? null
    slots.push({
      slot,
      branchId: selected?.id ?? null,
      branchName: `Bodega ${slot}`,
    })
  }
  return slots
}

export function BodegasPage() {
  const navigate = useNavigate()
  const modoPanel = esModoPanelSoloSeleccion()
  const puedeB1 = panelTieneModuloEscritura('inventario_bodega_1')
  const puedeB2 = panelTieneModuloEscritura('inventario_bodega_2')
  const puedeB3 = panelTieneModuloEscritura('inventario_bodega_3')
  const puedeInventario = panelTieneModuloEscritura('inventario')
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: listBranches, staleTime: 60_000 })
  const slots = useMemo(() => pickBodegaSlots(branchesQuery.data ?? []), [branchesQuery.data])
  const canAccessSlot = (slot: 1 | 2 | 3) => {
    if (!modoPanel) return true
    if (puedeInventario) return true
    if (slot === 1) return puedeB1
    if (slot === 2) return puedeB2
    return puedeB3
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-material-outline pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Inventario · Bodegas</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Seleccione una bodega para cargar productos por separado. Lo agregado aqui no se mezcla en la vista de productos.
        </p>
      </header>

      {branchesQuery.isLoading ? <p className="text-sm text-material-muted">Cargando bodegas…</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot) => (
          <article
            key={slot.slot}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (slot.branchId != null && canAccessSlot(slot.slot)) navigate(`/inventario/productos?bodega=${slot.slot}`)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                if (slot.branchId != null && canAccessSlot(slot.slot)) navigate(`/inventario/productos?bodega=${slot.slot}`)
              }
            }}
            className={`rounded-xl border border-material-outline bg-material-surface p-5 shadow-material transition focus:outline-none focus:ring-2 focus:ring-boutique-400 focus:ring-offset-2 ${
              slot.branchId != null && canAccessSlot(slot.slot)
                ? 'cursor-pointer hover:border-boutique-300 hover:shadow-md'
                : 'cursor-not-allowed opacity-60'
            }`}
            aria-label={`Abrir inventario de Bodega ${slot.slot}`}
          >
            <div
              aria-hidden
              className="mb-4 h-2 w-full rounded-full bg-[repeating-linear-gradient(135deg,#b91c1c_0px,#b91c1c_12px,#ef4444_12px,#ef4444_24px)]"
            />
            <h2 className="text-base font-semibold text-material-emphasis">Bodega {slot.slot}</h2>
            {slot.branchId != null && !canAccessSlot(slot.slot) ? (
              <p className="mt-1 text-xs text-material-muted">Sin permiso en su perfil.</p>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  )
}

