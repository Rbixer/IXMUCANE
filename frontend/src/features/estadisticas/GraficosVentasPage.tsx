import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPosDashboardSummary } from '../pos/pos.service'
import type { PosDashboardDaily } from '../pos/pos.service'

function formatMoney(s: string) {
  const n = Number(s)
  if (!Number.isFinite(n)) return s
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }).format(n)
}

function formatMoneyNumber(n: number) {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }).format(n)
}

const PERIOD_OPTIONS = [7, 14, 30] as const

export function GraficosVentasPage() {
  const [days, setDays] = useState<(typeof PERIOD_OPTIONS)[number]>(14)
  const q = useQuery({
    queryKey: ['pos', 'dashboard-summary', days],
    queryFn: () => fetchPosDashboardSummary(days),
    staleTime: 30_000,
  })
  const daily = q.data?.daily ?? []
  const dailyRows = useMemo(
    () =>
      daily.map((row, idx) => {
        const key = row.date ?? `d-${idx}`
        const label = row.date ? row.date.slice(5) : '—'
        const amountRaw = Number(row.amount)
        const amount = Number.isFinite(amountRaw) ? amountRaw : 0
        const count = Number.isFinite(row.count) ? row.count : 0
        const avgTicket = count > 0 ? amount / count : 0
        return { key, label, amount, count, avgTicket }
      }),
    [daily],
  )
  const topAmount = useMemo(
    () => Math.max(...dailyRows.map((r) => r.amount).filter(Number.isFinite), 1),
    [dailyRows],
  )

  return (
    <div className="space-y-8">
      <header className="border-b border-material-outline pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Gráficos de ventas</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Evolución diaria de facturación y número de tickets. Elija el rango de días para el informe.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-material-muted">Periodo</span>
          {PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                days === d
                  ? 'bg-boutique-600 text-white shadow-sm'
                  : 'border border-material-outline bg-material-surface text-material-emphasis hover:bg-material-surface-variant'
              }`}
            >
              {d} días
            </button>
          ))}
        </div>
      </header>

      {q.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {(q.error as Error).message}
        </p>
      ) : null}

      <section className="rounded-xl border border-material-outline bg-material-surface p-6 shadow-material">
        <h2 className="text-base font-semibold text-material-emphasis">Facturación diaria (barras)</h2>
        <p className="mt-0.5 text-sm text-material-muted">
          Visual ejecutivo de ingresos por día. Barras escaladas al mayor importe del periodo.
        </p>
        {q.isLoading ? (
          <p className="mt-4 text-sm text-material-muted">Cargando…</p>
        ) : dailyRows.length === 0 ? (
          <p className="mt-4 text-sm text-material-muted">No hay ventas en el periodo seleccionado.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-material-outline bg-material-surface-variant/40 p-3">
            <div className="flex min-w-[680px] items-end gap-2">
              {dailyRows.map((row) => {
                const pct = Math.max(6, Math.round((row.amount / topAmount) * 100))
                return (
                  <div key={row.key} className="flex w-10 shrink-0 flex-col items-center">
                    <span className="mb-1 text-[10px] font-semibold text-material-muted">
                      {row.amount > 0 ? formatMoneyNumber(row.amount).replace('GTQ', 'Q') : '—'}
                    </span>
                    <div className="flex h-48 w-full items-end rounded-t-md bg-material-surface-variant/70 px-1">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-boutique-600 to-red-500 shadow-sm"
                        style={{ height: `${pct}%` }}
                        title={`${row.label}: ${formatMoneyNumber(row.amount)} (${row.count} tickets)`}
                      />
                    </div>
                    <span className="mt-1 text-[10px] text-material-muted">{row.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-material-outline bg-material-surface p-6 shadow-material">
        <h2 className="text-base font-semibold text-material-emphasis">Productividad diaria (sin líneas)</h2>
        <p className="mt-0.5 text-sm text-material-muted">Tickets y ticket promedio por día para lectura gerencial.</p>
        {q.isLoading ? (
          <p className="mt-4 text-sm text-material-muted">Cargando…</p>
        ) : dailyRows.length === 0 ? (
          <p className="mt-4 text-sm text-material-muted">No hay datos.</p>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {dailyRows.map((row) => (
              <article
                key={`kpi-${row.key}`}
                className="rounded-lg border border-material-outline bg-material-surface p-3 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-material-muted">{row.label}</p>
                <p className="mt-1 text-base font-semibold text-material-emphasis">
                  {formatMoneyNumber(row.amount)}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="rounded-full bg-boutique-50 px-2 py-0.5 font-medium text-boutique-700">
                    {row.count} tickets
                  </span>
                  <span className="text-material-muted">
                    Promedio: {row.count > 0 ? formatMoneyNumber(row.avgTicket) : '—'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-material-outline bg-material-surface p-6 shadow-material">
        <h2 className="text-base font-semibold text-material-emphasis">Comparativo de importes</h2>
        <p className="mt-0.5 text-sm text-material-muted">Barras relativas al mayor importe del periodo.</p>
        {q.isLoading ? (
          <p className="mt-4 text-sm text-material-muted">Cargando…</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(q.data?.by_branch ?? []).slice(0, 8).map((row) => {
              const amt = Number(row.amount)
              const top = Math.max(
                ...((q.data?.by_branch ?? []).map((b) => Number(b.amount)).filter(Number.isFinite) as number[]),
                1,
              )
              const pct = Math.round(((Number.isFinite(amt) ? amt : 0) / top) * 100)
              return (
                <li key={row.branch_id}>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-material-emphasis">{row.branch_name}</span>
                    <span className="shrink-0 tabular-nums text-material-muted">{formatMoney(row.amount)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-material-surface-variant">
                    <div className="h-full rounded-full bg-boutique-500" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
