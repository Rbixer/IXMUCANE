import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  ShoppingBag,
  Coins,
  Hash,
  BarChart3,
  LineChart,
  LayoutPanelLeft,
  Store,
  CalendarDays,
  ArrowUpRight,
} from 'lucide-react'
import { fetchPosDashboardSummary } from '../pos/pos.service'
import { listBranches } from '../branches/branches.service'
import { DualLineDailySalesChart } from './LineTimeseriesChart'

/* ── helpers ─────────────────────────────────────────────────────────────── */

function fmtQ(s: string | number) {
  const n = Number(s)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtQShort(n: number) {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `Q${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `Q${(n / 1_000).toFixed(0)}K`
  return fmtQ(n)
}

const PERIODS = [7, 14, 30, 90] as const
type Period = (typeof PERIODS)[number]
const PERIOD_LABEL: Record<Period, string> = { 7: '7 días', 14: '14 días', 30: '30 días', 90: '90 días' }

const embedUrl = (import.meta.env.VITE_POWERBI_EMBED_URL as string | undefined)?.trim()

/* ── KPI card ────────────────────────────────────────────────────────────── */

function KpiCard({
  label,
  value,
  sub,
  Icon,
  gradient,
  loading,
}: {
  label: string
  value: string
  sub?: string
  Icon: React.ElementType
  gradient: string
  loading?: boolean
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 shadow-card ${gradient}`}
    >
      <div className="pointer-events-none absolute -right-4 -top-4 opacity-15">
        <Icon size={80} strokeWidth={1.2} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest text-white/60">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">
        {loading ? <span className="animate-pulse opacity-50">···</span> : value}
      </p>
      {sub ? <p className="mt-1 text-xs text-white/50">{sub}</p> : null}
      <ArrowUpRight size={14} className="absolute bottom-4 right-4 text-white/30" aria-hidden />
    </div>
  )
}

/* ── Tab button ──────────────────────────────────────────────────────────── */

function Tab({
  id,
  active,
  onClick,
  Icon,
  label,
}: {
  id: string
  active: boolean
  onClick: () => void
  Icon: React.ElementType
  label: string
}) {
  return (
    <button
      key={id}
      type="button"
      onClick={onClick}
      className={[
        'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150',
        active
          ? 'bg-app-surface shadow-card text-app-text border border-app-border'
          : 'text-app-muted hover:text-app-text hover:bg-app-surface/60',
      ].join(' ')}
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
export function EstadisticasPage() {
  const [period, setPeriod] = useState<Period>(14)
  const [tab, setTab] = useState<'resumen' | 'graficos' | 'powerbi'>('resumen')

  const summaryQ = useQuery({
    queryKey: ['pos', 'dashboard-summary', period],
    queryFn: () => fetchPosDashboardSummary(period),
    staleTime: 60_000,
  })
  const branchesQ = useQuery({ queryKey: ['branches'], queryFn: listBranches, staleTime: 120_000 })

  const d = summaryQ.data
  const loading = summaryQ.isLoading

  /* KPIs */
  const totalAmount = Number(d?.total_amount ?? 0)
  const periodAmount = Number(d?.last_7_days_amount ?? 0)
  const totalCount = d?.total_count ?? 0
  const periodCount = d?.last_7_days_count ?? 0

  /* Branch lookup */
  const branchMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const b of branchesQ.data ?? []) m.set(b.id, b.name)
    return m
  }, [branchesQ.data])

  const byBranch = useMemo(() => {
    return (d?.by_branch ?? []).map((row) => ({
      ...row,
      label: branchMap.get(row.branch_id) ?? row.branch_name ?? `Punto #${row.branch_id}`,
      amount: Number(row.amount),
    }))
  }, [d?.by_branch, branchMap])

  const topBranchAmt = useMemo(() => Math.max(...byBranch.map((r) => r.amount), 1), [byBranch])

  /* Daily data for charts */
  const dailyPoints = useMemo(() => {
    return (d?.daily ?? []).map((row, idx) => ({
      key: row.date ?? `d-${idx}`,
      label: row.date ? row.date.slice(5) : '—',
      amount: Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0,
      count: Number.isFinite(row.count) ? row.count : 0,
    }))
  }, [d?.daily])

  const topDayAmt = useMemo(() => Math.max(...dailyPoints.map((r) => r.amount), 1), [dailyPoints])

  return (
    <div className="space-y-6">

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-7"
        style={{
          background: 'linear-gradient(135deg, #07090F 0%, #0d1020 50%, #1a0a0a 100%)',
        }}
      >
        {/* decoración */}
        <div
          className="pointer-events-none absolute inset-0 opacity-100"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 15% 50%, rgba(220,38,38,0.12) 0%, transparent 55%),' +
              'radial-gradient(ellipse at 85% 20%, rgba(245,158,11,0.08) 0%, transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 shadow-brand-glow">
                <TrendingUp size={18} strokeWidth={2} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Estadísticas</h1>
                <p className="text-[11px] text-white/40">Análisis de ventas en tiempo real</p>
              </div>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                  period === p
                    ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-sm'
                    : 'text-white/50 hover:text-white/80',
                ].join(' ')}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total facturado"
          value={fmtQShort(totalAmount)}
          sub="Acumulado histórico"
          Icon={Coins}
          gradient="bg-gradient-to-br from-emerald-600 to-emerald-900"
          loading={loading}
        />
        <KpiCard
          label={`Facturado (${PERIOD_LABEL[period]})`}
          value={fmtQShort(periodAmount)}
          sub={`${periodCount} tickets en el periodo`}
          Icon={TrendingUp}
          gradient="bg-gradient-to-br from-brand-600 to-brand-900"
          loading={loading}
        />
        <KpiCard
          label="Total de ventas"
          value={totalCount.toLocaleString('es-GT')}
          sub="Tickets POS registrados"
          Icon={Hash}
          gradient="bg-gradient-to-br from-violet-600 to-violet-900"
          loading={loading}
        />
        <KpiCard
          label="Ticket promedio"
          value={periodCount > 0 ? fmtQShort(periodAmount / periodCount) : '—'}
          sub={`En los últimos ${period} días`}
          Icon={ShoppingBag}
          gradient="bg-gradient-to-br from-amber-600 to-amber-900"
          loading={loading}
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Tab id="resumen" active={tab === 'resumen'} onClick={() => setTab('resumen')} Icon={BarChart3} label="Resumen" />
        <Tab id="graficos" active={tab === 'graficos'} onClick={() => setTab('graficos')} Icon={LineChart} label="Gráficos" />
        {embedUrl ? (
          <Tab id="powerbi" active={tab === 'powerbi'} onClick={() => setTab('powerbi')} Icon={LayoutPanelLeft} label="Power BI" />
        ) : null}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {summaryQ.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(summaryQ.error as Error).message}
        </p>
      ) : null}

      {/* ═══════════════ TAB: RESUMEN ═══════════════════════════════════ */}
      {tab === 'resumen' ? (
        <div className="grid gap-5 xl:grid-cols-5">

          {/* Gráfico de barras diarias */}
          <div className="xl:col-span-3 rounded-2xl border border-app-border bg-app-surface p-6 shadow-card">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-app-text">Facturación diaria</h2>
                <p className="text-xs text-app-muted mt-0.5">Últimos {period} días</p>
              </div>
              {d ? (
                <span className="rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {fmtQ(d.last_7_days_amount)}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="h-48 animate-pulse rounded-xl bg-app-bg" />
            ) : dailyPoints.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-app-border">
                <p className="text-sm text-app-muted">Sin ventas en este periodo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex min-w-[480px] items-end gap-1.5 px-1" style={{ height: 180 }}>
                  {dailyPoints.map((row) => {
                    const pct = Math.max(4, Math.round((row.amount / topDayAmt) * 100))
                    const hasData = row.amount > 0
                    return (
                      <div key={row.key} className="flex flex-1 flex-col items-center gap-0.5">
                        {hasData ? (
                          <span className="text-[9px] font-semibold text-app-muted leading-none mb-1">
                            {fmtQShort(row.amount)}
                          </span>
                        ) : (
                          <span className="text-[9px] leading-none mb-1 opacity-0">·</span>
                        )}
                        <div
                          className="flex w-full max-w-[36px] items-end rounded-t-md overflow-hidden"
                          style={{ height: 140 }}
                        >
                          <div
                            className={`w-full rounded-t-md transition-all duration-300 ${hasData ? 'bg-gradient-to-t from-brand-700 to-brand-400' : 'bg-app-border'}`}
                            style={{ height: `${pct}%` }}
                            title={`${row.label}: ${fmtQ(row.amount)} (${row.count} tickets)`}
                          />
                        </div>
                        <span className="text-[9px] text-app-subtle mt-1">{row.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Desglose por sucursal */}
          <div className="xl:col-span-2 rounded-2xl border border-app-border bg-app-surface p-6 shadow-card">
            <div className="mb-5 flex items-center gap-2">
              <Store size={15} strokeWidth={1.75} className="text-app-muted" />
              <h2 className="text-sm font-bold text-app-text">Por sucursal</h2>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-app-bg" />
                ))}
              </div>
            ) : byBranch.length === 0 ? (
              <p className="text-sm text-app-muted">Sin datos.</p>
            ) : (
              <ul className="space-y-3">
                {byBranch.map((row) => {
                  const pct = Math.round((row.amount / topBranchAmt) * 100)
                  return (
                    <li key={row.branch_id}>
                      <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                        <span className="font-semibold text-app-text truncate">{row.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-app-muted">{row.count} ventas</span>
                          <span className="font-bold text-app-text tabular-nums">{fmtQ(String(row.amount))}</span>
                        </div>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-app-bg">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Cards diarias (productividad) */}
          <div className="xl:col-span-5 rounded-2xl border border-app-border bg-app-surface p-6 shadow-card">
            <div className="mb-5 flex items-center gap-2">
              <CalendarDays size={15} strokeWidth={1.75} className="text-app-muted" />
              <h2 className="text-sm font-bold text-app-text">Productividad diaria</h2>
              <span className="text-xs text-app-muted">· ticket promedio por día</span>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-app-bg" />
                ))}
              </div>
            ) : dailyPoints.length === 0 ? (
              <p className="text-sm text-app-muted">Sin datos para el periodo.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
                {dailyPoints.map((row) => {
                  const avg = row.count > 0 ? row.amount / row.count : 0
                  const hasData = row.amount > 0
                  return (
                    <div
                      key={`day-${row.key}`}
                      className={`rounded-xl border p-3 transition-all ${
                        hasData
                          ? 'border-brand-200/40 bg-gradient-to-b from-brand-50/30 to-transparent'
                          : 'border-app-border bg-app-bg/30'
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">{row.label}</p>
                      <p className="mt-1.5 text-sm font-bold text-app-text tabular-nums">
                        {hasData ? fmtQShort(row.amount) : '—'}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${hasData ? 'bg-brand-50 text-brand-700' : 'bg-app-bg text-app-muted'}`}>
                          {row.count} tickets
                        </span>
                        {avg > 0 ? (
                          <span className="text-[9px] text-app-subtle tabular-nums">~{fmtQShort(avg)}</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ═══════════════ TAB: GRÁFICOS ══════════════════════════════════ */}
      {tab === 'graficos' ? (
        <div className="space-y-5">

          {/* Dual line chart */}
          <div className="rounded-2xl border border-app-border bg-app-surface p-6 shadow-card">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-app-text">Facturación y tickets por día</h2>
                <p className="text-xs text-app-muted mt-0.5">
                  Línea azul = importes · línea verde = cantidad de ventas
                </p>
              </div>
            </div>

            {loading ? (
              <div className="h-64 animate-pulse rounded-xl bg-app-bg" />
            ) : dailyPoints.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-app-border">
                <p className="text-sm text-app-muted">Sin ventas en este periodo.</p>
              </div>
            ) : (
              <DualLineDailySalesChart
                points={dailyPoints}
                formatMoneyY={(n) =>
                  new Intl.NumberFormat('es-GT', {
                    style: 'currency',
                    currency: 'GTQ',
                    maximumFractionDigits: 0,
                    notation: 'compact',
                  }).format(n)
                }
              />
            )}
          </div>

          {/* Comparativo por sucursal — barras horizontales */}
          <div className="rounded-2xl border border-app-border bg-app-surface p-6 shadow-card">
            <div className="mb-5 flex items-center gap-2">
              <Store size={15} strokeWidth={1.75} className="text-app-muted" />
              <h2 className="text-sm font-bold text-app-text">Comparativo por sucursal</h2>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-app-bg" />)}
              </div>
            ) : byBranch.length === 0 ? (
              <p className="text-sm text-app-muted">Sin datos.</p>
            ) : (
              <ul className="space-y-4">
                {byBranch.map((row, idx) => {
                  const pct = Math.round((row.amount / topBranchAmt) * 100)
                  const colors = [
                    'from-brand-600 to-brand-400',
                    'from-violet-600 to-violet-400',
                    'from-amber-600 to-amber-400',
                    'from-emerald-600 to-emerald-400',
                    'from-sky-600 to-sky-400',
                  ]
                  const color = colors[idx % colors.length]
                  return (
                    <li key={row.branch_id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-app-text truncate">{row.label}</span>
                        <div className="flex items-center gap-3 shrink-0 text-xs">
                          <span className="text-app-muted">{row.count} ventas · {pct}%</span>
                          <span className="font-bold text-app-text tabular-nums">{fmtQ(String(row.amount))}</span>
                        </div>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-app-bg">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {/* ═══════════════ TAB: POWER BI ══════════════════════════════════ */}
      {tab === 'powerbi' ? (
        <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="w-full"
              style={{ height: 'calc(100vh - 14rem)', minHeight: 520, border: 0 }}
              title="Power BI Dashboard"
              allowFullScreen
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-900 shadow-card">
                <LayoutPanelLeft size={28} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-app-text">Power BI no configurado</h3>
                <p className="mt-1 max-w-sm text-sm text-app-muted">
                  Agrega la variable <code className="rounded bg-app-bg px-1.5 py-0.5 font-mono text-xs text-app-text">VITE_POWERBI_EMBED_URL</code> en el archivo <code className="rounded bg-app-bg px-1.5 py-0.5 font-mono text-xs text-app-text">.env</code> para activar el panel embebido.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}

    </div>
  )
}
