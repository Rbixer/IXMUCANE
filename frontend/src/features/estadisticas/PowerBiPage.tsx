import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, LayoutDashboard, Store } from 'lucide-react'
import { fetchPosDashboardSummary } from '../pos/pos.service'
import { getInventoryBranchSummary } from '../inventory/inventory.service'
import { listBranches } from '../branches/branches.service'
import { LineTimeseriesChart } from './LineTimeseriesChart'

const embedUrl = (import.meta.env.VITE_POWERBI_EMBED_URL as string | undefined)?.trim()

function formatMoney(s: string) {
  const n = Number(s)
  if (!Number.isFinite(n)) return s
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }).format(n)
}

function pctOf(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0
  return Math.min(100, Math.round((part / whole) * 100))
}

function cleanBranchLabel(name: string): string {
  const cleaned = name
    .replace(/\bsucursal\b/gi, '')
    .replace(/\bcentro\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned || 'Punto'
}

/** Anillo KPI estilo panel (porcentaje centrado). */
function KpiRing({
  pct,
  label,
  subtitle,
  strokeColor,
}: {
  pct: number
  label: string
  subtitle: string
  strokeColor: string
}) {
  const p = Math.min(100, Math.max(0, Math.round(pct)))
  const r = 52
  const c = 2 * Math.PI * r
  const dash = (p / 100) * c
  return (
    <div className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-5 shadow-sm">
      <div className="relative mx-auto h-[9.5rem] w-[9.5rem]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="11" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            strokeWidth="11"
            stroke={strokeColor}
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{p}%</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">del total</span>
        </div>
      </div>
      <p className="mt-3 text-center text-sm font-semibold text-slate-800">{label}</p>
      <p className="mt-1 text-center text-xs leading-snug text-slate-600">{subtitle}</p>
    </div>
  )
}

/** Dona con gradiente cónico (mezcla de categorías). */
function ConicDona({
  segments,
  size = 168,
}: {
  segments: { pct: number; color: string; label: string }[]
  size?: number
}) {
  const norm = useMemo(() => {
    const sum = segments.reduce((a, s) => a + Math.max(0, s.pct), 0) || 1
    let acc = 0
    return segments.map((s) => {
      const p = (Math.max(0, s.pct) / sum) * 100
      const from = acc
      acc += p
      return { ...s, from, to: acc, slice: p }
    })
  }, [segments])

  const gradient = norm.map((s) => `${s.color} ${s.from}% ${s.to}%`).join(', ')
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
      <div
        className="shrink-0 rounded-full border-4 border-white shadow-md ring-1 ring-slate-200/80"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${gradient})`,
        }}
        role="img"
        aria-label="Gráfico de proporciones"
      />
      <ul className="min-w-0 space-y-2 text-sm">
        {norm.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm shadow-sm" style={{ backgroundColor: s.color }} />
            <span className="font-medium text-slate-800">{s.label}</span>
            <span className="tabular-nums text-slate-500">{Math.round(s.slice)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const CHART_BAR_MAX_PX = 200

/** Columnas verticales (estilo Power BI): importes proporcionales al máximo del conjunto. */
function VerticalBarChart({
  points,
}: {
  points: { key: string; label: string; value: number; hint?: string }[]
}) {
  const max = useMemo(() => Math.max(...points.map((p) => p.value), 1), [points])

  return (
    <div className="flex gap-2">
      <div
        className="flex w-11 shrink-0 flex-col justify-between border-r border-slate-300 pr-1.5 text-right text-[9px] tabular-nums leading-tight text-slate-500"
        aria-hidden
      >
        <span>{formatMoney(String(max))}</span>
        <span>{formatMoney(String(Math.round(max * 0.5)))}</span>
        <span>{formatMoney('0')}</span>
      </div>
      <div
        className="min-w-0 flex-1 overflow-x-auto pb-1"
        style={{
          backgroundImage:
            'linear-gradient(to top, #e2e8f0 1px, transparent 1px), linear-gradient(to top, #e2e8f0 1px, transparent 1px), linear-gradient(to top, #e2e8f0 1px, transparent 1px), linear-gradient(to top, #e2e8f0 1px, transparent 1px)',
          backgroundSize: '100% 25%, 100% 25%, 100% 25%, 100% 25%',
          backgroundPosition: 'bottom',
        }}
      >
        <div
          className="flex h-[260px] min-w-min items-end justify-stretch gap-1.5 border-b-2 border-slate-400 px-1 pt-2"
          role="img"
          aria-label="Gráfico de barras verticales"
        >
          {points.map((p, i) => {
            const px = Math.round((p.value / max) * CHART_BAR_MAX_PX)
            const tone =
              i % 4 === 0
                ? 'from-[#1e3a5f] to-[#2563eb]'
                : i % 4 === 1
                  ? 'from-boutique-700 to-boutique-400'
                  : i % 4 === 2
                    ? 'from-amber-800 to-amber-400'
                    : 'from-teal-800 to-teal-500'
            return (
              <div
                key={p.key}
                className="flex min-w-[40px] max-w-[72px] flex-1 flex-col items-center justify-end gap-0.5"
              >
                <span className="max-w-full truncate px-0.5 text-center text-[9px] font-semibold tabular-nums text-slate-800">
                  {p.value > 0 ? formatMoney(String(p.value)) : '—'}
                </span>
                <div
                  className={`w-[min(92%,52px)] rounded-t-md bg-gradient-to-t shadow-sm ${tone}`}
                  style={{ height: `${Math.max(8, px)}px` }}
                  title={p.hint ?? `${p.label}: ${formatMoney(String(p.value))}`}
                />
                <span className="mt-1.5 max-w-[4.5rem] truncate text-center text-[9px] font-medium text-slate-600">
                  {p.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Barra horizontal con etiqueta y porcentaje (estilo informe). */
function PctBarRow({
  label,
  pct,
  valueLabel,
  barClass,
}: {
  label: string
  pct: number
  valueLabel: string
  barClass: string
}) {
  const w = Math.min(100, Math.max(0, Math.round(pct)))
  return (
    <li className="space-y-1">
      <div className="flex justify-between gap-2 text-xs">
        <span className="truncate font-medium text-slate-800">{label}</span>
        <span className="shrink-0 tabular-nums text-slate-600">
          {valueLabel} · <span className="font-semibold text-slate-900">{w}%</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/90">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${w}%` }} />
      </div>
    </li>
  )
}

export function PowerBiPage() {
  const [days, setDays] = useState<7 | 14 | 30>(14)

  const posQuery = useQuery({
    queryKey: ['pos', 'dashboard-summary', 'power-bi', days],
    queryFn: () => fetchPosDashboardSummary(days),
    staleTime: 30_000,
  })

  const invQuery = useQuery({
    queryKey: ['inventory-summary', 'power-bi'],
    queryFn: getInventoryBranchSummary,
    staleTime: 30_000,
  })

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: listBranches,
    staleTime: 60_000,
  })

  const branchName = useMemo(() => {
    const m = new Map<number, string>()
    for (const b of branchesQuery.data ?? []) {
      if (b.id > 0) m.set(b.id, b.name)
    }
    return (id: number) => m.get(id) ?? `Punto #${id}`
  }, [branchesQuery.data])

  const pos = posQuery.data
  const totalAmt = pos ? Number(pos.total_amount) : 0
  const weekAmt = pos ? Number(pos.last_7_days_amount) : 0
  const totalCnt = pos?.total_count ?? 0
  const weekCnt = pos?.last_7_days_count ?? 0

  const pctFacturacion7 = pctOf(weekAmt, totalAmt)
  const pctTickets7 = pctOf(weekCnt, totalCnt)

  const branchBars = useMemo(() => {
    const rows = pos?.by_branch ?? []
    const sum = rows.reduce((a, b) => a + Number(b.amount), 0) || 1
    return rows.map((b) => ({
      ...b,
      pct: (Number(b.amount) / sum) * 100,
      amt: Number(b.amount),
    }))
  }, [pos?.by_branch])

  const invMix = useMemo(() => {
    const data = invQuery.data ?? {}
    let dama = 0
    let cab = 0
    let mov = 0
    let skus = 0
    for (const row of Object.values(data)) {
      dama += row['ropa-dama'] ?? 0
      cab += row['ropa-caballero'] ?? 0
      mov += row.stock_movimientos ?? 0
      skus += row.total ?? 0
    }
    return { dama, cab, mov, skus }
  }, [invQuery.data])

  const movVsSkuPct = useMemo(() => {
    const { mov, skus } = invMix
    if (skus <= 0) return 0
    return Math.min(999, Math.round((mov / skus) * 100))
  }, [invMix])

  const dailyExecutive = useMemo(() => {
    const rows = (pos?.daily ?? []).map((row, idx) => {
      const amount = Number(row.amount) || 0
      const count = Number.isFinite(row.count) ? row.count : 0
      return {
        key: row.date ?? `d-${idx}`,
        label: row.date ? row.date.slice(5) : `—${idx}`,
        date: row.date,
        amount,
        count,
        avgTicket: count > 0 ? amount / count : 0,
      }
    })
    const cumulative = rows.reduce((a, r) => a + r.amount, 0)
    const bestAmount = rows.reduce((best, r) => (r.amount > best.amount ? r : best), {
      key: 'none',
      label: '—',
      date: null as string | null,
      amount: 0,
      count: 0,
      avgTicket: 0,
    })
    const bestCount = rows.reduce((best, r) => (r.count > best.count ? r : best), {
      key: 'none',
      label: '—',
      date: null as string | null,
      amount: 0,
      count: 0,
      avgTicket: 0,
    })
    return { rows, cumulative, bestAmount, bestCount }
  }, [pos?.daily])
  const areaDailyPoints = useMemo(
    () =>
      dailyExecutive.rows.map((row) => ({
        key: `area-${row.key}`,
        label: row.label,
        value: row.amount,
      })),
    [dailyExecutive.rows],
  )

  return (
    <div className="space-y-8">
      <header className="border-b border-material-outline pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <LayoutDashboard className="h-7 w-7 text-amber-500" aria-hidden />
          <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Power BI · paneles locales</h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-material-muted">
          Visualizaciones con porcentajes, barras y líneas sobre ventas POS, facturación e inventario. Los datos
          provienen del mismo resumen que el dashboard; el periodo de la serie diaria se ajusta arriba.
        </p>
      </header>

      {embedUrl ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-material-muted">Informe embebido</h2>
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-material-outline bg-black shadow-material">
            <iframe title="Power BI" src={embedUrl} className="h-full min-h-[420px] w-full border-0" allowFullScreen />
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-sm font-medium text-slate-700">Periodo serie diaria (POS)</span>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {([7, 14, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                days === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {d} días
            </button>
          ))}
        </div>
      </section>

      {posQuery.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {(posQuery.error as Error).message}
        </p>
      ) : null}

      {/* KPI anillos — facturación y tickets */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Nivel de facturación y ventas (POS)</h2>
        <p className="mb-4 text-sm text-slate-600">
          Porcentaje que representan los <strong className="font-semibold text-slate-800">últimos 7 días</strong> frente
          al histórico completo del sistema (tickets e importes).
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:max-w-3xl">
          <KpiRing
            pct={pctFacturacion7}
            label="Facturación (últimos 7 días)"
            subtitle={`${formatMoney(pos?.last_7_days_amount ?? '0')} de ${formatMoney(pos?.total_amount ?? '0')} acumulados`}
            strokeColor="#f59e0b"
          />
          <KpiRing
            pct={pctTickets7}
            label="Tickets de venta (últimos 7 días)"
            subtitle={`${weekCnt} de ${totalCnt} ventas registradas`}
            strokeColor="#c40000"
          />
        </div>
      </section>

      {/* Gráficos de barras — reporte POS */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-600" aria-hidden />
          <h2 className="text-base font-semibold text-slate-900">Gráficos de barras (reporte POS)</h2>
        </div>
        <p className="mb-6 text-sm text-slate-600">
          Columnas proporcionales al mayor valor de cada gráfico. Eje izquierdo en quetzales; desplace horizontalmente
          si hay muchos días o puntos.
        </p>
        {posQuery.isLoading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : (
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Facturación por día ({days} días)
              </h3>
              {(pos?.daily ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Sin ventas en el periodo.</p>
              ) : (
                <VerticalBarChart
                  points={(pos?.daily ?? []).map((row, idx) => ({
                    key: row.date ?? `d-${idx}`,
                    label: row.date ? row.date.slice(5) : `—${idx}`,
                    value: Number(row.amount) || 0,
                    hint: `${row.date ?? ''}: ${row.count} ventas`,
                  }))}
                />
              )}
            </div>
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Facturación por punto (histórico)
              </h3>
              {branchBars.length === 0 ? (
                <p className="text-sm text-slate-500">Sin datos por punto.</p>
              ) : (
                <VerticalBarChart
                  points={branchBars.slice(0, 12).map((row) => ({
                    key: String(row.branch_id),
                    label:
                      (row.branch_name || branchName(row.branch_id)).length > 12
                        ? `${(row.branch_name || branchName(row.branch_id)).slice(0, 10)}…`
                        : row.branch_name || branchName(row.branch_id),
                    value: row.amt,
                    hint: `${row.branch_name || branchName(row.branch_id)}: ${row.count} ventas`,
                  }))}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Distribución por punto */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Store className="h-5 w-5 text-slate-600" aria-hidden />
          <h2 className="text-base font-semibold text-slate-900">Participación por punto (facturación)</h2>
        </div>
        <p className="mb-5 text-sm text-slate-600">
          Cada barra muestra la parte del total facturado histórico atribuida a ese punto (suma = 100%).
        </p>
        {posQuery.isLoading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : branchBars.length === 0 ? (
          <p className="text-sm text-slate-500">Sin ventas por punto para graficar.</p>
        ) : (
          <ul className="max-w-2xl space-y-3">
            {branchBars.slice(0, 12).map((row, i) => (
              <PctBarRow
                key={row.branch_id}
                label={cleanBranchLabel(row.branch_name || branchName(row.branch_id))}
                pct={row.pct}
                valueLabel={formatMoney(String(row.amt))}
                barClass={i % 3 === 0 ? 'bg-boutique-500' : i % 3 === 1 ? 'bg-amber-500' : 'bg-teal-600'}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Serie diaria estilo mercado */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Serie diaria — gráfico de acciones</h2>
        <p className="mt-1 text-sm text-slate-600">
          Vista tipo mercado: línea de facturación diaria y barras de actividad (tickets) del periodo de {days} días.
        </p>
        {posQuery.isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Cargando…</p>
        ) : (
          <StockStyleDailyChart daily={pos?.daily ?? []} />
        )}
      </section>

      {/* Vista corporativa sin líneas */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Analítica ejecutiva del periodo</h2>
        <p className="mb-6 text-sm text-slate-600">
          Vista profesional sin líneas: KPIs de desempeño y ranking diario de facturación para comités de gerencia.
        </p>
        {posQuery.isLoading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : dailyExecutive.rows.length === 0 ? (
          <p className="text-sm text-slate-500">Sin ventas en el periodo seleccionado.</p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Facturación acumulada</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(String(dailyExecutive.cumulative))}</p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mejor día (importe)</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {dailyExecutive.bestAmount.label} · {formatMoney(String(dailyExecutive.bestAmount.amount))}
                </p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pico de tickets</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {dailyExecutive.bestCount.label} · {dailyExecutive.bestCount.count}
                </p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ticket promedio periodo</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {totalCnt > 0 ? formatMoney(String(dailyExecutive.cumulative / totalCnt)) : '—'}
                </p>
              </article>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Facturación diaria (gráfica de área)
              </h3>
              <p className="mb-3 text-xs text-slate-500">
                Evolución de importes en el periodo seleccionado, con relleno para lectura ejecutiva.
              </p>
              <LineTimeseriesChart
                points={areaDailyPoints}
                stroke="#c40000"
                formatY={(n) => formatMoney(String(Math.round(n)))}
              />
            </div>
          </div>
        )}
      </section>

      {!embedUrl ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 text-center text-xs text-slate-600">
          Para incrustar un informe de Power BI Service, configure{' '}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px]">VITE_POWERBI_EMBED_URL</code> en el
          entorno del front.
        </p>
      ) : null}
    </div>
  )
}

function StockStyleDailyChart({ daily }: { daily: { date: string | null; count: number; amount: string }[] }) {
  const rows = useMemo(
    () =>
      daily.map((row, idx) => {
        const amountRaw = Number(row.amount)
        const amount = Number.isFinite(amountRaw) ? amountRaw : 0
        return {
          key: row.date ?? `d-${idx}`,
          label: row.date ? row.date.slice(5) : `—${idx}`,
          amount,
          count: Number.isFinite(row.count) ? row.count : 0,
        }
      }),
    [daily],
  )

  const maxAmount = useMemo(() => Math.max(...rows.map((r) => r.amount), 1), [rows])
  const maxCount = useMemo(() => Math.max(...rows.map((r) => r.count), 1), [rows])
  const totalAmount = useMemo(() => rows.reduce((a, r) => a + r.amount, 0), [rows])

  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-slate-500">No hay ventas en el periodo.</p>
  }

  return (
    <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
      <p className="text-xs text-slate-500">
        Total periodo: <span className="font-semibold text-slate-800">{formatMoney(String(totalAmount))}</span>
      </p>

      <div className="overflow-x-auto">
        <div className="min-w-[680px] space-y-3">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-semibold uppercase tracking-wide">Facturación diaria</span>
              <span>Escala al máximo del periodo</span>
            </div>
            <div className="flex h-52 items-end gap-2 border-b border-slate-200 pb-2">
            {rows.map((row) => {
              const hPx = Math.max(8, Math.round((row.amount / maxAmount) * 180))
              return (
                <div key={`price-${row.key}`} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] font-semibold text-slate-700">
                    {row.amount > 0 ? formatMoney(String(row.amount)).replace('GTQ', 'Q') : '—'}
                  </span>
                  <div
                    className="w-full rounded-t-sm bg-gradient-to-t from-emerald-600 to-emerald-400"
                    style={{ height: `${hPx}px` }}
                    title={`${row.label}: ${formatMoney(String(row.amount))}`}
                  />
                </div>
              )
            })}
          </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-semibold uppercase tracking-wide">Actividad (tickets)</span>
              <span>Volumen diario</span>
            </div>
            <div className="flex h-20 items-end gap-2 border-b border-slate-200 pb-1">
            {rows.map((row) => {
              const hPx = Math.max(8, Math.round((row.count / maxCount) * 56))
              return (
                <div key={`vol-${row.key}`} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className="w-full rounded-sm bg-gradient-to-t from-blue-700 to-blue-500"
                    style={{ height: `${hPx}px` }}
                    title={`${row.label}: ${row.count} tickets`}
                  />
                </div>
              )
            })}
          </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(40px,1fr))] gap-2 px-1 text-center text-[10px] text-slate-500">
            {rows.map((row) => (
              <span key={`lbl-${row.key}`} className="truncate">
                {row.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
