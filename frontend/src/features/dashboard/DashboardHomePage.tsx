import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Banknote,
  BarChart3,
  ChevronRight,
  ClipboardList,
  FolderInput,
  LayoutGrid,
  LineChart,
  Package,
  Presentation,
  Store,
  TrendingUp,
  Warehouse,
} from 'lucide-react'
import { api } from '../../shared/api/client'
import { StatCard } from '../../shared/ui/StatCard'
import { getInventoryBranchSummary } from '../inventory/inventory.service'
import { fetchPosDashboardSummary } from '../pos/pos.service'
import { esModoPanelSoloSeleccion } from '../../shared/lib/accesoSesion'

type CountResponse = { count: number }

function formatMoney(s: string) {
  const n = Number(s)
  if (!Number.isFinite(n)) return s
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }).format(n)
}

function formatNumber(n: number) {
  return new Intl.NumberFormat('es-GT').format(n)
}

export function DashboardHomePage() {
  const navigate = useNavigate()
  const modoPanel = esModoPanelSoloSeleccion()

  const inventory = useQuery({
    queryKey: ['dashboard', 'inventory-count'],
    queryFn: async () => (await api.get<CountResponse>('/inventory/count/')).data.count,
  })
  const stock = useQuery({
    queryKey: ['dashboard', 'stock-count'],
    queryFn: async () => (await api.get<CountResponse>('/stock/count/')).data.count,
  })
  const summaryQuery = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: getInventoryBranchSummary,
    staleTime: 15_000,
  })
  const salesSummary = useQuery({
    queryKey: ['pos', 'dashboard-summary', 14],
    queryFn: () => fetchPosDashboardSummary(14),
    staleTime: 30_000,
  })

  const lineMix = useMemo(() => {
    const data = summaryQuery.data ?? {}
    let dama = 0
    let cab = 0
    let mov = 0
    for (const row of Object.values(data)) {
      dama += row['ropa-dama'] ?? 0
      cab += row['ropa-caballero'] ?? 0
      mov += row.stock_movimientos ?? 0
    }
    const productTotal = dama + cab
    return { dama, cab, mov, productTotal }
  }, [summaryQuery.data])

  const chartDaily = salesSummary.data?.daily ?? []
  const salesByBranch = salesSummary.data?.by_branch ?? []
  const maxDaily = useMemo(() => {
    let m = 0
    for (const row of chartDaily) {
      const v = Number(row.amount)
      if (Number.isFinite(v) && v > m) m = v
    }
    return m || 1
  }, [chartDaily])
  const maxBranchAmount = useMemo(() => {
    let m = 0
    for (const row of salesByBranch) {
      const v = Number(row.amount)
      if (Number.isFinite(v) && v > m) m = v
    }
    return m || 1
  }, [salesByBranch])
  const lastUpdatedLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('es-GT', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date()),
    [],
  )
  const loadingDots = '...'

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-red-900/40 bg-gradient-to-r from-red-900 via-red-800 to-red-900 p-6 text-slate-50 shadow-material">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">Executive Dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-200/90">
              {modoPanel
                ? 'Vista de tienda con foco en desempeño comercial e inventario.'
                : 'Resumen ejecutivo de ventas POS y salud de inventario.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1">Actualizado {lastUpdatedLabel}</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1">Ventana: 14 días</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1">Moneda: GTQ</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/estadisticas/graficos-ventas')}
            className="inline-flex items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/20"
          >
            Ver análisis de ventas
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-material-outline bg-material-surface p-5 shadow-material sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-material-muted">Resumen de ventas (POS)</h2>
          <span className="rounded-full border border-material-outline bg-material-surface-variant px-2.5 py-1 text-[11px] font-medium text-material-muted">
            {salesSummary.data ? `${formatNumber(salesSummary.data.total_count)} tickets históricos` : 'Sincronizando datos'}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Ventas totales"
            value={salesSummary.data ? String(salesSummary.data.total_count) : salesSummary.isLoading ? loadingDots : '0'}
            caption="Tickets registrados"
            icon={TrendingUp}
            iconWrapClassName="bg-emerald-50 text-emerald-700"
            onClick={() => navigate('/estadisticas/metricas-ventas')}
          />
          <StatCard
            label="Facturación total"
            value={
              salesSummary.data ? formatMoney(salesSummary.data.total_amount) : salesSummary.isLoading ? loadingDots : '—'
            }
            caption="Suma histórica de totales"
            icon={Banknote}
            iconWrapClassName="bg-amber-50 text-amber-700"
            onClick={() => navigate('/estadisticas/graficos-ventas')}
          />
          <StatCard
            label="Últimos 7 días"
            value={
              salesSummary.data ? String(salesSummary.data.last_7_days_count) : salesSummary.isLoading ? loadingDots : '0'
            }
            caption={`${salesSummary.data ? formatMoney(salesSummary.data.last_7_days_amount) : '…'} en el periodo`}
            icon={BarChart3}
            iconWrapClassName="bg-violet-50 text-violet-600"
            onClick={() => navigate('/pos/vender')}
          />
          <StatCard
            label="Análisis avanzado"
            value="Power BI"
            caption="Informes corporativos"
            icon={Presentation}
            iconWrapClassName="bg-sky-50 text-sky-700"
            onClick={() => navigate('/estadisticas/power-bi')}
          />
        </div>
        {salesSummary.error ? (
          <p className="mt-2 text-xs text-red-600">{(salesSummary.error as Error).message}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-material-outline bg-material-surface p-5 shadow-material sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-material-muted">Estado de inventario</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Productos en inventario"
          value={inventory.data ?? loadingDots}
          caption="Ítems únicos en catálogo"
          icon={Package}
          iconWrapClassName="bg-violet-50 text-violet-600"
          onClick={() => navigate('/inventario/productos')}
        />
        <StatCard
          label="Movimientos de stock"
          value={stock.data ?? loadingDots}
          caption="Registros de entrada y salida"
          icon={Warehouse}
          iconWrapClassName="bg-amber-50 text-amber-700"
          onClick={() => navigate('/inventario/stock')}
        />
        <StatCard
          label="Categorías"
          value={lineMix.productTotal || (summaryQuery.isLoading ? loadingDots : 0)}
          caption="Suma de existencias por ítem en inventario"
          icon={LayoutGrid}
          iconWrapClassName="bg-boutique-50 text-boutique-600"
          onClick={() => navigate('/inventario/categorias')}
        />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-material-outline bg-material-surface p-6 shadow-material lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-material-outline pb-4">
            <div>
              <h2 className="text-base font-semibold text-material-emphasis">Gráfico de ventas (14 días)</h2>
              <p className="mt-0.5 text-sm text-material-muted">Importe facturado por día. Deslice horizontalmente en pantallas pequeñas.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/estadisticas/graficos-ventas')}
              className="text-xs font-semibold text-boutique-600 hover:underline"
            >
              Ver detalle
            </button>
          </div>
          {salesSummary.isLoading ? (
            <p className="mt-6 text-sm text-material-muted">Cargando serie…</p>
          ) : chartDaily.length === 0 ? (
            <p className="mt-6 text-sm text-material-muted">Aún no hay ventas en los últimos 14 días.</p>
          ) : (
            <div
              className="mt-6 flex h-48 snap-x snap-mandatory items-end gap-1.5 overflow-x-auto pb-1"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {chartDaily.map((row, idx) => {
                const amt = Number(row.amount)
                const h = Math.round(((Number.isFinite(amt) ? amt : 0) / maxDaily) * 100)
                const label = row.date ? row.date.slice(5) : '—'
                return (
                  <div
                    key={row.date ? `${row.date}-${idx}` : `d-${idx}`}
                    className="flex h-full min-w-[36px] snap-start flex-col justify-end"
                  >
                    <div
                      className="mx-auto w-6 rounded-t bg-gradient-to-t from-boutique-600 to-boutique-400"
                      style={{ height: `${Math.max(6, h)}%` }}
                      title={`${row.date}: ${formatMoney(row.amount)}`}
                    />
                    <div className="mt-1 text-center text-[9px] text-material-muted">{label}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-material-outline bg-material-surface p-5 shadow-material">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-material-emphasis">Desglose de ventas</h2>
                <p className="mt-1 text-xs text-material-muted">Distribución del importe vendido.</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/estadisticas/graficos-ventas')}
                className="text-[11px] font-semibold text-boutique-600 hover:underline"
              >
                Ver detalle
              </button>
            </div>
            {salesSummary.isLoading ? (
              <p className="mt-4 text-xs text-material-muted">Cargando datos…</p>
            ) : salesByBranch.length === 0 ? (
              <p className="mt-4 text-xs text-material-muted">Aún no hay ventas para mostrar en el desglose.</p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {salesByBranch.slice(0, 5).map((row) => {
                  const amount = Number(row.amount)
                  const width = Math.max(
                    8,
                    Math.round(((Number.isFinite(amount) ? amount : 0) / maxBranchAmount) * 100),
                  )
                  return (
                    <div key={row.branch_id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate font-medium text-material-emphasis">{row.branch_name}</span>
                        <span className="text-material-muted">
                          {formatMoney(row.amount)} · {row.count} tickets
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-material-surface-variant">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-boutique-500 to-sky-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-material-outline bg-material-surface p-5 shadow-material">
            <h2 className="text-sm font-semibold text-material-emphasis">Inventario y movimientos</h2>
            <p className="mt-1 text-xs text-material-muted">Resumen del catálogo.</p>
            <div className="mt-4 rounded-lg border border-dashed border-material-outline bg-material-surface-variant/80 px-3 py-3 text-xs text-material-muted">
              <span className="font-semibold text-material-emphasis">Ítems en catálogo: </span>
              {summaryQuery.isLoading ? '…' : lineMix.productTotal} referencias ·{' '}
              <span className="font-semibold text-material-emphasis">Movimientos de stock: </span>
              {summaryQuery.isLoading ? '…' : lineMix.mov} registros.
            </div>
          </div>
          {!modoPanel ? (
            <div className="rounded-xl border border-material-outline bg-gradient-to-br from-material-surface to-boutique-50/40 p-5 shadow-material">
              <div className="flex items-center gap-2 text-sm font-semibold text-material-emphasis">
                <Store size={18} className="text-boutique-500" aria-hidden />
                Punto de venta (POS)
              </div>
              <p className="mt-1 text-xs text-material-muted">Vender y consultar facturas desde el panel.</p>
              <button
                type="button"
                onClick={() => navigate('/pos/vender')}
                className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg bg-boutique-500 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-boutique-600"
              >
                Abrir POS
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-material-outline bg-material-surface p-6 shadow-material">
        <h2 className="text-base font-semibold text-material-emphasis">Accesos rápidos</h2>
        <p className="mt-0.5 text-sm text-material-muted">Pedidos, categorías y estadísticas.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => navigate('/inventario/pedidos')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-material-outline bg-material-surface px-4 py-2.5 text-sm font-medium text-material-emphasis shadow-sm transition hover:border-boutique-200 hover:bg-boutique-50/60"
          >
            <ClipboardList size={18} className="text-boutique-600" aria-hidden />
            Pedidos
          </button>
          {!modoPanel ? (
            <button
              type="button"
              onClick={() => navigate('/inventario/categorias')}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-material-outline bg-material-surface px-4 py-2.5 text-sm font-medium text-material-emphasis shadow-sm transition hover:border-boutique-200 hover:bg-boutique-50/60"
            >
              <FolderInput size={18} className="text-violet-600" aria-hidden />
              Categorías
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate('/estadisticas/metricas-ventas')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-material-outline bg-material-surface px-4 py-2.5 text-sm font-medium text-material-emphasis shadow-sm transition hover:border-boutique-200 hover:bg-boutique-50/60"
          >
            <BarChart3 size={18} className="text-sky-600" aria-hidden />
            Métricas ventas
          </button>
          <button
            type="button"
            onClick={() => navigate('/estadisticas/graficos-ventas')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-material-outline bg-material-surface px-4 py-2.5 text-sm font-medium text-material-emphasis shadow-sm transition hover:border-boutique-200 hover:bg-boutique-50/60"
          >
            <LineChart size={18} className="text-amber-700" aria-hidden />
            Gráficos ventas
          </button>
          {modoPanel ? (
            <button
              type="button"
              onClick={() => navigate('/carrito')}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-material-outline bg-material-surface px-4 py-2.5 text-sm font-medium text-material-emphasis shadow-sm transition hover:border-boutique-200 hover:bg-boutique-50/60"
            >
              <Package size={18} className="text-boutique-600" aria-hidden />
              Carrito
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
