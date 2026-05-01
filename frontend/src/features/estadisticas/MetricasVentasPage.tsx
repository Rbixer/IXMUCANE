import { useQuery } from '@tanstack/react-query'
import { fetchPosDashboardSummary } from '../pos/pos.service'
import { StatCard } from '../../shared/ui/StatCard'
import { BarChart3, CalendarDays, Coins, Hash } from 'lucide-react'

function formatMoney(s: string) {
  const n = Number(s)
  if (!Number.isFinite(n)) return s
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n)
}

export function MetricasVentasPage() {
  const q = useQuery({
    queryKey: ['pos', 'dashboard-summary', 14],
    queryFn: () => fetchPosDashboardSummary(14),
    staleTime: 30_000,
  })
  const d = q.data

  return (
    <div className="space-y-8">
      <header className="border-b border-material-outline pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Métricas de ventas</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Resumen consolidado del módulo POS: totales históricos y actividad de los últimos 7 días.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ventas registradas"
          value={d ? String(d.total_count) : q.isLoading ? '…' : '0'}
          caption="Tickets POS en el sistema"
          icon={Hash}
          iconWrapClassName="bg-sky-50 text-sky-600"
        />
        <StatCard
          label="Facturación acumulada"
          value={d ? formatMoney(d.total_amount) : q.isLoading ? '…' : '—'}
          caption="Suma de totales de venta"
          icon={Coins}
          iconWrapClassName="bg-amber-50 text-amber-700"
        />
        <StatCard
          label="Últimos 7 días (tickets)"
          value={d ? String(d.last_7_days_count) : q.isLoading ? '…' : '0'}
          caption="Número de ventas en la semana"
          icon={CalendarDays}
          iconWrapClassName="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Últimos 7 días (importe)"
          value={d ? formatMoney(d.last_7_days_amount) : q.isLoading ? '…' : '—'}
          caption="Suma de totales en la semana"
          icon={BarChart3}
          iconWrapClassName="bg-boutique-50 text-boutique-600"
        />
      </section>

      {q.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {(q.error as Error).message}
        </p>
      ) : null}

      <section className="rounded-xl border border-material-outline bg-material-surface p-6 shadow-material">
        <h2 className="text-base font-semibold text-material-emphasis">Desglose por punto de venta</h2>
        <p className="mt-0.5 text-sm text-material-muted">Hasta 24 registros ordenados por total facturado.</p>
        <ul className="mt-4 divide-y divide-material-outline text-sm">
          {(d?.by_branch ?? []).length === 0 && !q.isLoading ? (
            <li className="py-2 text-material-muted">Sin datos para el desglose.</li>
          ) : null}
          {(d?.by_branch ?? []).map((row) => (
            <li key={row.branch_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium text-material-emphasis">
                {(row.branch_name ?? '').trim().toLowerCase() === 'sucursal centro'
                  ? 'TIENDA'
                  : row.branch_name || `Punto #${row.branch_id}`}
              </span>
              <span className="tabular-nums text-material-muted">{row.count} ventas</span>
              <span className="font-semibold tabular-nums text-boutique-600">{formatMoney(row.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
