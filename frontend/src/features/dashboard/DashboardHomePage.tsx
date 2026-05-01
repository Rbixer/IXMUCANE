import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FolderInput,
  LineChart,
  Package,
  Presentation,
  Store,
  TrendingUp,
  Warehouse,
  Zap,
} from 'lucide-react'
import { api } from '../../shared/api/client'
import { StatCard } from '../../shared/ui/StatCard'
import { getInventoryBranchSummary, listInventory } from '../inventory/inventory.service'
import { fetchPosDashboardSummary } from '../pos/pos.service'
import { esModoPanelSoloSeleccion } from '../../shared/lib/accesoSesion'

const LOW_STOCK_THRESHOLD = 10

type CountResponse = { count: number }

function formatMoney(s: string) {
  const n = Number(s)
  if (!Number.isFinite(n)) return s
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }).format(n)
}
function formatNumber(n: number) {
  return new Intl.NumberFormat('es-GT').format(n)
}

const QUICK_LINKS = [
  { label: 'Pedidos',         Icon: ClipboardList, to: '/inventario/pedidos',              color: 'text-brand-600',  bg: 'bg-brand-50'   },
  { label: 'Categorías',      Icon: FolderInput,   to: '/inventario/categorias',            color: 'text-prime-600', bg: 'bg-prime-50'  },
  { label: 'Métricas',        Icon: BarChart3,      to: '/estadisticas/metricas-ventas',     color: 'text-sky-600',   bg: 'bg-sky-50'    },
  { label: 'Gráficos ventas', Icon: LineChart,      to: '/estadisticas/graficos-ventas',     color: 'text-ix-700',    bg: 'bg-ix-50'     },
] as const

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

  const inventoryQuery = useQuery({
    queryKey: ['dashboard', 'inventory-all'],
    queryFn: () => listInventory(),
    staleTime: 60_000,
  })

  const lowStockItems = useMemo(
    () => (inventoryQuery.data ?? []).filter((i) => i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD),
    [inventoryQuery.data],
  )
  const noStockItems = useMemo(
    () => (inventoryQuery.data ?? []).filter((i) => i.quantity <= 0),
    [inventoryQuery.data],
  )

  const lineMix = useMemo(() => {
    const data = summaryQuery.data ?? {}
    let dama = 0; let cab = 0; let mov = 0
    for (const row of Object.values(data)) {
      dama += row['ropa-dama'] ?? 0
      cab += row['ropa-caballero'] ?? 0
      mov += row.stock_movimientos ?? 0
    }
    return { dama, cab, mov, productTotal: dama + cab }
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

  const lastUpdated = useMemo(
    () => new Intl.DateTimeFormat('es-GT', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
    [],
  )
  const ld = '…'

  return (
    <div className="space-y-6">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      {/* Fondo de página con manchas de color para el efecto glass */}
      <div className="relative rounded-2xl overflow-hidden" style={{ padding: '1px' }}>
        {/* Capa de gradiente vivo detrás del glass */}
        <div className="absolute inset-0 rounded-2xl" style={{
          background: 'linear-gradient(135deg, #312e81 0%, #1e1b4b 30%, #0f172a 55%, #1e1b4b 75%, #312e81 100%)',
        }} />
        {/* Manchas de color para efecto líquido */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden" aria-hidden>
          <div style={{ position:'absolute', top:'-30%', left:'-10%', width:'55%', height:'180%', background:'radial-gradient(ellipse, rgba(99,102,241,0.55) 0%, transparent 65%)', filter:'blur(35px)' }} />
          <div style={{ position:'absolute', top:'20%', right:'-5%', width:'45%', height:'130%', background:'radial-gradient(ellipse, rgba(167,139,250,0.45) 0%, transparent 65%)', filter:'blur(30px)' }} />
          <div style={{ position:'absolute', bottom:'-20%', left:'35%', width:'40%', height:'100%', background:'radial-gradient(ellipse, rgba(192,38,211,0.3) 0%, transparent 65%)', filter:'blur(28px)' }} />
        </div>

        {/* Tarjeta glass */}
        <header className="relative overflow-hidden rounded-2xl text-white" style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.15), 0 8px 32px rgba(0,0,0,0.25)',
        }}>
          {/* Shimmer de luz en el borde superior */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 40%, rgba(255,255,255,0.5) 60%, transparent 100%)' }} />

          <div className="relative z-10 flex items-center justify-between gap-4 px-6 py-5 sm:px-8">

            {/* ── Texto izquierdo ── */}
            <div className="flex flex-col gap-2 max-w-md">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                  style={{ boxShadow: '0 0 6px 2px rgba(52,211,153,0.8)' }} />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                  {modoPanel ? 'Vista de tienda' : 'Panel administrativo'}
                </p>
              </div>

              <h1 className="text-2xl font-black tracking-tight text-white leading-tight sm:text-3xl">
                Dashboard{' '}
                <span style={{
                  background: 'linear-gradient(90deg, #c4b5fd 0%, #f0abfc 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  ejecutivo
                </span>
              </h1>

              <p className="text-xs text-white/45 leading-relaxed font-medium">
                {modoPanel
                  ? 'Desempeño comercial e inventario de la tienda en tiempo real.'
                  : 'Resumen de ventas POS, inventario y métricas clave del negocio.'}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {[`Actualizado ${lastUpdated}`, '14 días', 'GTQ'].map((t) => (
                  <span key={t} className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white/50"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    {t}
                  </span>
                ))}
                <button type="button" onClick={() => navigate('/estadisticas')}
                  className="ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black text-white transition hover:opacity-80"
                  style={{ background: 'rgba(99,102,241,0.6)', border: '1px solid rgba(165,180,252,0.4)' }}>
                  Analíticas
                  <ArrowRight size={11} />
                </button>
              </div>
            </div>

            {/* ── Esfera giratoria compacta ── */}
            <div className="relative hidden sm:flex shrink-0 items-center justify-center" style={{ width: 140, height: 140 }} aria-hidden>
              <style>{`
                @keyframes ix-orb-glow  { 0%,100%{opacity:.6}  50%{opacity:1} }
                @keyframes ix-ring-a    { from{transform:rotateX(72deg) rotateZ(0deg)}   to{transform:rotateX(72deg) rotateZ(360deg)} }
                @keyframes ix-ring-b    { from{transform:rotateX(18deg) rotateZ(0deg)}   to{transform:rotateX(18deg) rotateZ(-360deg)} }
                @keyframes ix-ring-c    { from{transform:rotateX(45deg) rotateZ(0deg)}   to{transform:rotateX(45deg) rotateZ(360deg)} }
                @keyframes ix-orbit-a   { from{transform:rotate(0deg) translateX(62px) rotate(0deg)}     to{transform:rotate(360deg) translateX(62px) rotate(-360deg)} }
                @keyframes ix-orbit-b   { from{transform:rotate(120deg) translateX(50px) rotate(-120deg)} to{transform:rotate(480deg) translateX(50px) rotate(-480deg)} }
                @keyframes ix-orbit-c   { from{transform:rotate(240deg) translateX(70px) rotate(-240deg)} to{transform:rotate(600deg) translateX(70px) rotate(-600deg)} }
                @keyframes ix-float-orb { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
              `}</style>

              <div style={{ width:140, height:140, animation:'ix-float-orb 5s ease-in-out infinite', perspective:'400px' }}>
                {/* Glow exterior */}
                <div style={{ position:'absolute', inset:-16, borderRadius:'50%', background:'radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 65%)', animation:'ix-orb-glow 3s ease-in-out infinite' }} />

                {/* Esfera glass */}
                <div style={{
                  position:'absolute', inset:8, borderRadius:'50%',
                  background:'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.22) 0%, rgba(167,139,250,0.18) 25%, rgba(99,102,241,0.12) 50%, rgba(15,12,41,0.75) 75%, rgba(8,6,24,0.9) 100%)',
                  boxShadow:'inset -8px -8px 20px rgba(0,0,0,0.5), inset 5px 5px 14px rgba(255,255,255,0.08), 0 0 30px rgba(99,102,241,0.25)',
                  border:'1px solid rgba(255,255,255,0.2)',
                  backdropFilter:'blur(8px)',
                }} />

                {/* Brillo especular glass */}
                <div style={{
                  position:'absolute', left:'26%', top:'18%',
                  width:30, height:18, borderRadius:'50%',
                  background:'radial-gradient(circle, rgba(255,255,255,0.45) 0%, transparent 70%)',
                  transform:'rotate(-25deg)', filter:'blur(2px)',
                }} />
                {/* Brillo secundario pequeño */}
                <div style={{
                  position:'absolute', left:'55%', top:'55%',
                  width:10, height:10, borderRadius:'50%',
                  background:'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)',
                  filter:'blur(1px)',
                }} />

                {/* Anillos */}
                <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1px solid rgba(165,180,252,0.55)', animation:'ix-ring-a 5s linear infinite', transformStyle:'preserve-3d' }} />
                <div style={{ position:'absolute', inset:8, borderRadius:'50%', border:'1px solid rgba(216,180,254,0.4)', animation:'ix-ring-b 8s linear infinite', transformStyle:'preserve-3d' }} />
                <div style={{ position:'absolute', inset:16, borderRadius:'50%', border:'1px dashed rgba(99,102,241,0.3)', animation:'ix-ring-c 11s linear infinite reverse', transformStyle:'preserve-3d' }} />

                {/* Puntos orbitales */}
                {[
                  { anim:'ix-orbit-a', dur:'4s', size:7, color:'#a5b4fc', glow:'rgba(165,180,252,0.9)' },
                  { anim:'ix-orbit-b', dur:'6s', size:5, color:'#e879f9', glow:'rgba(232,121,249,0.9)' },
                  { anim:'ix-orbit-c', dur:'7.5s', size:4, color:'#6ee7b7', glow:'rgba(110,231,183,0.9)' },
                ].map((d, i) => (
                  <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:d.size, height:d.size, marginTop:-d.size/2, marginLeft:-d.size/2, animation:`${d.anim} ${d.dur} linear infinite` }}>
                    <div style={{ width:d.size, height:d.size, borderRadius:'50%', background:d.color, boxShadow:`0 0 ${d.size+3}px 2px ${d.glow}` }} />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </header>
      </div>

      {/* ── KPIs de ventas ───────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-app-muted">Resumen de ventas (POS)</h2>
          <span className="rounded-full border border-app-border bg-app-surface px-2.5 py-1 text-[11px] text-app-muted">
            {salesSummary.data
              ? `${formatNumber(salesSummary.data.total_count)} tickets históricos`
              : 'Cargando…'}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Ventas totales"
            value={salesSummary.data ? String(salesSummary.data.total_count) : salesSummary.isLoading ? ld : '0'}
            caption="Tickets registrados"
            icon={TrendingUp}
            gradient="linear-gradient(135deg, #064E3B 0%, #065F46 50%, #047857 100%)"
            onClick={() => navigate('/estadisticas/metricas-ventas')}
          />
          <StatCard
            label="Facturación total"
            value={salesSummary.data ? formatMoney(salesSummary.data.total_amount) : salesSummary.isLoading ? ld : '—'}
            caption="Suma histórica de totales"
            icon={Banknote}
            gradient="linear-gradient(135deg, #78350F 0%, #92400E 50%, #B45309 100%)"
            onClick={() => navigate('/estadisticas/graficos-ventas')}
          />
          <StatCard
            label="Últimos 7 días"
            value={salesSummary.data ? String(salesSummary.data.last_7_days_count) : salesSummary.isLoading ? ld : '0'}
            caption={`${salesSummary.data ? formatMoney(salesSummary.data.last_7_days_amount) : '…'} en el periodo`}
            icon={BarChart3}
            gradient="linear-gradient(135deg, #3B0764 0%, #4C1D95 50%, #5B21B6 100%)"
            onClick={() => navigate('/pos/vender')}
          />
          <StatCard
            label="Power BI"
            value="Analítica"
            caption="Informes corporativos"
            icon={Presentation}
            gradient="linear-gradient(135deg, #0C4A6E 0%, #075985 50%, #0369A1 100%)"
            onClick={() => navigate('/estadisticas/power-bi')}
          />
        </div>
        {salesSummary.error ? (
          <p className="mt-2 text-xs text-brand-600">{(salesSummary.error as Error).message}</p>
        ) : null}
      </section>

      {/* ── Estado de inventario ─────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-app-muted">Estado de inventario</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Productos en catálogo"
            value={inventory.data ?? ld}
            caption="Ítems únicos registrados"
            icon={Package}
            iconWrapClassName="bg-prime-100 text-prime-600"
            onClick={() => navigate('/inventario/productos')}
          />
          <StatCard
            label="Movimientos de stock"
            value={stock.data ?? ld}
            caption="Registros de entrada y salida"
            icon={Warehouse}
            iconWrapClassName="bg-ix-100 text-ix-700"
            onClick={() => navigate('/inventario/stock')}
          />
          <StatCard
            label="Existencias catálogo"
            value={lineMix.productTotal || (summaryQuery.isLoading ? ld : 0)}
            caption="Suma de cantidades por ítem"
            icon={Package}
            iconWrapClassName="bg-brand-100 text-brand-600"
            onClick={() => navigate('/inventario/categorias')}
          />
        </div>
      </section>

      {/* ── Gráfico + Desglose ───────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-3">

        {/* Gráfico de barras */}
        <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-app-text">Ventas diarias</h2>
              <p className="mt-0.5 text-xs text-app-muted">Facturado por día · últimos 14 días</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/estadisticas/graficos-ventas')}
              className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
            >
              Ver detalle <ChevronRight size={13} />
            </button>
          </div>
          {salesSummary.isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-app-muted">Cargando…</div>
          ) : chartDaily.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-app-border text-sm text-app-muted">
              Sin ventas en los últimos 14 días
            </div>
          ) : (
            <div
              className="flex h-48 items-end gap-1.5 overflow-x-auto pb-1"
              style={{ scrollbarWidth: 'none' }}
            >
              {chartDaily.map((row, idx) => {
                const amt = Number(row.amount)
                const h = Math.round(((Number.isFinite(amt) ? amt : 0) / maxDaily) * 100)
                const label = row.date ? row.date.slice(5) : '—'
                const isLast = idx === chartDaily.length - 1
                return (
                  <div
                    key={row.date ? `${row.date}-${idx}` : `d-${idx}`}
                    className="group flex h-full min-w-[38px] flex-1 flex-col items-center justify-end gap-1"
                  >
                    <div
                      className={[
                        'w-full max-w-[28px] rounded-t-lg transition-all duration-200 group-hover:opacity-100',
                        isLast ? 'opacity-100' : 'opacity-70',
                      ].join(' ')}
                      style={{
                        height: `${Math.max(4, h)}%`,
                        background: isLast
                          ? 'linear-gradient(180deg, #F59E0B 0%, #DC2626 100%)'
                          : 'linear-gradient(180deg, #6366F1 0%, #4338CA 100%)',
                      }}
                      title={`${row.date}: ${formatMoney(row.amount)}`}
                    />
                    <span className="text-[9px] font-medium text-app-subtle">{label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Desglose + POS */}
        <div className="flex flex-col gap-4">

          {/* Desglose por punto */}
          <div className="flex-1 rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-app-text">Desglose por punto</h2>
                <p className="text-xs text-app-muted">Facturación histórica</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/estadisticas/graficos-ventas')}
                className="text-[11px] font-semibold text-brand-600 hover:underline"
              >
                Ver
              </button>
            </div>
            {salesSummary.isLoading ? (
              <p className="text-xs text-app-muted">Cargando…</p>
            ) : salesByBranch.length === 0 ? (
              <p className="text-xs text-app-muted">Sin datos disponibles.</p>
            ) : (
              <div className="space-y-3">
                {salesByBranch.slice(0, 4).map((row, i) => {
                  const amount = Number(row.amount)
                  const width = Math.max(8, Math.round(((Number.isFinite(amount) ? amount : 0) / maxBranchAmount) * 100))
                  const colors = ['bg-brand-500', 'bg-ix-500', 'bg-prime-500', 'bg-sky-500']
                  return (
                    <div key={row.branch_id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate font-medium text-app-text">{row.branch_name}</span>
                        <span className="shrink-0 text-app-muted">{row.count} tickets</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-app-bg">
                        <div
                          className={`h-full rounded-full ${colors[i % colors.length]}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* POS rápido */}
          {!modoPanel ? (
            <div
              className="rounded-2xl p-5 text-white shadow-card"
              style={{ background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)' }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/20">
                  <Store size={18} className="text-brand-400" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Punto de Venta</p>
                  <p className="text-[11px] text-white/50">Vender y facturar</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/pos/vender')}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
              >
                <Zap size={15} aria-hidden />
                Abrir POS
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Accesos rápidos ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-app-text">Accesos rápidos</h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.filter((l) => !modoPanel || !['Categorías'].includes(l.label)).map(({ label, Icon, to, color, bg }) => (
            <button
              key={to}
              type="button"
              onClick={() => navigate(to)}
              className="group flex items-center gap-3 rounded-xl border border-app-border bg-app-surface px-4 py-3 text-left transition-all duration-150 hover:border-app-border-strong hover:shadow-card hover:-translate-y-0.5"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                <Icon size={17} className={color} aria-hidden />
              </div>
              <span className="text-sm font-medium text-app-text">{label}</span>
              <ChevronRight size={14} className="ml-auto shrink-0 text-app-subtle transition group-hover:translate-x-0.5" aria-hidden />
            </button>
          ))}
          {modoPanel ? (
            <button
              type="button"
              onClick={() => navigate('/carrito')}
              className="group flex items-center gap-3 rounded-xl border border-app-border bg-app-surface px-4 py-3 text-left transition-all duration-150 hover:border-app-border-strong hover:shadow-card hover:-translate-y-0.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <Package size={17} className="text-brand-600" aria-hidden />
              </div>
              <span className="text-sm font-medium text-app-text">Carrito</span>
              <ChevronRight size={14} className="ml-auto shrink-0 text-app-subtle transition group-hover:translate-x-0.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </section>

      {/* ── Cuentas por cobrar ───────────────────────────────────────────── */}
      {(salesSummary.data?.pending_collection_count ?? 0) > 0 ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <CreditCard size={15} className="text-blue-500" />
            <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-app-muted">Cuentas por cobrar</h2>
          </div>
          <div
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100">
                <CreditCard size={22} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-500">Ventas pendientes de cobro</p>
                <p className="text-2xl font-black tabular-nums text-blue-900">
                  Q {Number(salesSummary.data?.pending_collection_amount ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] font-semibold text-blue-400">
                  {salesSummary.data?.pending_collection_count} venta{(salesSummary.data?.pending_collection_count ?? 0) !== 1 ? 's' : ''} a crédito o pago pendiente
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/pos/facturas')}
              className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-50"
            >
              Ver facturas
              <ArrowRight size={13} />
            </button>
          </div>
        </section>
      ) : null}

      {/* ── Alertas de stock ─────────────────────────────────────────────── */}
      {(lowStockItems.length > 0 || noStockItems.length > 0) ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-500" />
            <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-app-muted">Alertas de inventario</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Stock bajo */}
            {lowStockItems.length > 0 ? (
              <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100">
                      <AlertTriangle size={15} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-amber-900">Stock bajo</p>
                      <p className="text-[10px] text-amber-600">{lowStockItems.length} producto{lowStockItems.length !== 1 ? 's' : ''} con ≤{LOW_STOCK_THRESHOLD} unidades</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/inventario/productos')}
                    className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-50"
                  >
                    Ver todos
                  </button>
                </div>
                <div className="space-y-1.5">
                  {lowStockItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-gray-800">{item.name}</p>
                        <p className="font-mono text-[10px] text-gray-400">SKU: {item.sku}</p>
                      </div>
                      <span className="ml-3 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                        {item.quantity} u.
                      </span>
                    </div>
                  ))}
                  {lowStockItems.length > 5 ? (
                    <p className="pt-1 text-center text-[10px] font-semibold text-amber-600">
                      + {lowStockItems.length - 5} más…
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Sin stock */}
            {noStockItems.length > 0 ? (
              <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100">
                      <Package size={15} className="text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-red-900">Sin stock</p>
                      <p className="text-[10px] text-red-500">{noStockItems.length} producto{noStockItems.length !== 1 ? 's' : ''} agotado{noStockItems.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/inventario/productos')}
                    className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[10px] font-bold text-red-700 hover:bg-red-50"
                  >
                    Ver todos
                  </button>
                </div>
                <div className="space-y-1.5">
                  {noStockItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-gray-800">{item.name}</p>
                        <p className="font-mono text-[10px] text-gray-400">SKU: {item.sku}</p>
                      </div>
                      <span className="ml-3 shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
                        0 u.
      </span>
                    </div>
                  ))}
                  {noStockItems.length > 5 ? (
                    <p className="pt-1 text-center text-[10px] font-semibold text-red-500">
                      + {noStockItems.length - 5} más…
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

          </div>
        </section>
      ) : null}
    </div>
  )
}
