import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  FileSpreadsheet,
  Boxes,
  Store,
  Truck,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Building2,
  Hash,
  Phone,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  PiggyBank,
  Calendar,
  Users,
} from 'lucide-react'
import {
  downloadGananciasReport,
  downloadReportFile,
  fetchReportGananciasJson,
  fetchReportInventoryJson,
  fetchReportPosJson,
  fetchReportSuppliersJson,
  type GananciasPeriodo,
  type InventoryReportItem,
  type PosReportSale,
  type SupplierReportItem,
  type PurchaseOrderReportItem,
} from './reportes.service'
import { listBranches } from '../branches/branches.service'

/* ── helpers ─────────────────────────────────────────────────────────────── */

function fmtQ(s: string | number) {
  const n = Number(s)
  if (!Number.isFinite(n)) return String(s)
  return `Q ${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

function bodegaSlotFromName(name: string): 1 | 2 | 3 | null {
  const m = name.trim().toLowerCase().match(/^bodega\s*([123])$/)
  if (!m) return null
  const n = Number(m[1])
  return n === 1 || n === 2 || n === 3 ? n : null
}

/* ── Tab button ──────────────────────────────────────────────────────────── */

function Tab({
  id,
  active,
  onClick,
  Icon,
  label,
  count,
}: {
  id: string
  active: boolean
  onClick: () => void
  Icon: React.ElementType
  label: string
  count?: number
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
      {count != null ? (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-brand-100 text-brand-700' : 'bg-app-bg text-app-muted'}`}>
          {count}
        </span>
      ) : null}
    </button>
  )
}

/* ── Export button ───────────────────────────────────────────────────────── */

function ExportBtn({
  format,
  loading,
  onClick,
  label,
}: {
  format: 'pdf' | 'xlsx'
  loading: boolean
  onClick: () => void
  label?: string
}) {
  const Icon = format === 'pdf' ? FileText : FileSpreadsheet
  const color = format === 'pdf' ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all disabled:opacity-50 ${color}`}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
      {loading ? 'Generando…' : (label ?? (format === 'pdf' ? 'PDF' : 'Excel'))}
    </button>
  )
}

/* ── Stat pill ───────────────────────────────────────────────────────────── */

function StatPill({ label, value, color = 'brand' }: { label: string; value: string | number; color?: string }) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 border-brand-100 text-brand-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
  }
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color] ?? colors.brand}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
export function ReportesPage() {
  const [tab, setTab] = useState<'ganancias' | 'inventario' | 'ventas' | 'proveedores'>('ganancias')
  const [busyInv, setBusyInv] = useState<'pdf' | 'xlsx' | null>(null)
  const [busyPos, setBusyPos] = useState<'pdf' | 'xlsx' | null>(null)
  const [busySup, setBusySup] = useState<'pdf' | 'xlsx' | null>(null)
  const [busyGan, setBusyGan] = useState<'pdf' | 'xlsx' | null>(null)
  const [errInv, setErrInv] = useState<string | null>(null)
  const [errPos, setErrPos] = useState<string | null>(null)
  const [errSup, setErrSup] = useState<string | null>(null)
  const [errGan, setErrGan] = useState<string | null>(null)
  const [scopeInv, setScopeInv] = useState<'all' | 'tienda' | 'b1' | 'b2' | 'b3'>('all')
  const [periodoGan, setPeriodoGan] = useState<GananciasPeriodo>('semana')
  const [branchGan, setBranchGan] = useState<number | 'all'>('all')

  const branchesQ = useQuery({ queryKey: ['branches'], queryFn: listBranches, staleTime: 120_000 })
  const invQ      = useQuery({ queryKey: ['reports', 'inventario', 'all'], queryFn: () => fetchReportInventoryJson() })
  const posQ      = useQuery({ queryKey: ['reports', 'sistema-pos', 'all'], queryFn: () => fetchReportPosJson() })
  const supQ      = useQuery({ queryKey: ['reports', 'proveedores', 'all'], queryFn: () => fetchReportSuppliersJson() })
  const ganQ      = useQuery({
    queryKey: ['reports', 'ganancias', periodoGan, branchGan],
    queryFn: () => fetchReportGananciasJson(periodoGan, branchGan === 'all' ? undefined : branchGan),
    staleTime: 30_000,
  })

  /* ── Branch filter helpers ────────────────────────────────────────────── */
  const bodegaBranchBySlot = useMemo(() => {
    const bySlot = new Map<1 | 2 | 3, number>()
    for (const b of branchesQ.data ?? []) {
      if (b.id <= 0) continue
      const slot = bodegaSlotFromName(b.name)
      if (slot != null) bySlot.set(slot, b.id)
    }
    return { b1: bySlot.get(1) ?? null, b2: bySlot.get(2) ?? null, b3: bySlot.get(3) ?? null }
  }, [branchesQ.data])

  const bodegaBranchIds = useMemo(
    () => new Set([bodegaBranchBySlot.b1, bodegaBranchBySlot.b2, bodegaBranchBySlot.b3].filter(Boolean)),
    [bodegaBranchBySlot],
  )

  const invRows = useMemo<InventoryReportItem[]>(() => {
    const all = invQ.data?.items ?? []
    if (scopeInv === 'all') return all
    if (scopeInv === 'tienda') return all.filter((i) => !bodegaBranchIds.has(i.branch_id))
    const target = bodegaBranchBySlot[scopeInv]
    return target ? all.filter((i) => i.branch_id === target) : []
  }, [invQ.data, scopeInv, bodegaBranchBySlot, bodegaBranchIds])

  const posRows  = posQ.data?.ventas ?? [] as PosReportSale[]
  const supRows  = supQ.data?.proveedores ?? [] as SupplierReportItem[]
  const ordRows  = supQ.data?.ordenes ?? [] as PurchaseOrderReportItem[]

  /* ── Stats ────────────────────────────────────────────────────────────── */
  const invTotal = invRows.reduce((s, r) => s + r.cantidad, 0)
  const posTotal = posRows.reduce((s, r) => s + Number(r.total), 0)
  const supOrdersTotal = ordRows.length

  /* ── Download handlers ────────────────────────────────────────────────── */
  const dlInv = async (fmt: 'pdf' | 'xlsx') => {
    setBusyInv(fmt); setErrInv(null)
    try {
      await downloadReportFile('/reports/inventario/', fmt, `inventario_${scopeInv}_${stamp()}.${fmt}`, undefined,
        scopeInv === 'all' ? undefined : scopeInv as 'tienda'|'b1'|'b2'|'b3')
    } catch (e) { setErrInv(e instanceof Error ? e.message : 'Error al generar.') }
    finally { setBusyInv(null) }
  }
  const dlPos = async (fmt: 'pdf' | 'xlsx') => {
    setBusyPos(fmt); setErrPos(null)
    try {
      await downloadReportFile('/reports/sistema-pos/', fmt, `ventas_pos_${stamp()}.${fmt}`)
    } catch (e) { setErrPos(e instanceof Error ? e.message : 'Error al generar.') }
    finally { setBusyPos(null) }
  }
  const dlSup = async (fmt: 'pdf' | 'xlsx') => {
    setBusySup(fmt); setErrSup(null)
    try {
      await downloadReportFile('/reports/proveedores/', fmt, `proveedores_${stamp()}.${fmt}`)
    } catch (e) { setErrSup(e instanceof Error ? e.message : 'Error al generar.') }
    finally { setBusySup(null) }
  }
  const dlGan = async (fmt: 'pdf' | 'xlsx') => {
    setBusyGan(fmt); setErrGan(null)
    try {
      await downloadGananciasReport(fmt, periodoGan, branchGan === 'all' ? undefined : branchGan)
    } catch (e) { setErrGan(e instanceof Error ? e.message : 'Error al generar.') }
    finally { setBusyGan(null) }
  }

  return (
    <div className="space-y-6">

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-7"
        style={{ background: 'linear-gradient(135deg, #07090F 0%, #0d1020 50%, #0a0a18 100%)' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-100"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 15% 50%, rgba(220,38,38,0.10) 0%, transparent 55%),' +
              'radial-gradient(ellipse at 85% 20%, rgba(16,185,129,0.07) 0%, transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 shadow-brand-glow">
              <ClipboardList size={18} strokeWidth={2} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Reportes</h1>
              <p className="text-[11px] text-white/40">Exporta tus datos en PDF o Excel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Download size={14} className="text-white/30" />
            <span className="text-xs text-white/40">PDF · Excel · Vista previa</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Tab id="gan" active={tab === 'ganancias'}   onClick={() => setTab('ganancias')}   Icon={TrendingUp} label="Ganancias" />
        <Tab id="inv" active={tab === 'inventario'}  onClick={() => setTab('inventario')}  Icon={Boxes}      label="Inventario"  count={invRows.length} />
        <Tab id="pos" active={tab === 'ventas'}      onClick={() => setTab('ventas')}      Icon={Store}      label="Ventas POS"  count={posRows.length} />
        <Tab id="sup" active={tab === 'proveedores'} onClick={() => setTab('proveedores')} Icon={Truck}      label="Proveedores" count={supRows.length} />
      </div>

      {/* ═══════════ TAB: GANANCIAS ════════════════════════════════════ */}
      {tab === 'ganancias' ? (
        <GananciasTab
          periodo={periodoGan}
          setPeriodo={setPeriodoGan}
          branchGan={branchGan}
          setBranchGan={setBranchGan}
          branches={(branchesQ.data ?? []).filter((b) => b.id > 0)}
          query={ganQ}
          dl={dlGan}
          busy={busyGan}
          err={errGan}
        />
      ) : null}

      {/* ═══════════ TAB: INVENTARIO ════════════════════════════════════ */}
      {tab === 'inventario' ? (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatPill label="Productos" value={invRows.length.toLocaleString('es-GT')} color="brand" />
            <StatPill label="Unidades totales" value={invTotal.toLocaleString('es-GT')} color="emerald" />
            <StatPill label="Disponibles" value={invRows.filter(r => r.cantidad > 0).length} color="violet" />
            <StatPill label="Sin stock" value={invRows.filter(r => r.cantidad <= 0).length} color="amber" />
          </div>

          {/* Controles de exportación */}
          <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-app-text">Reporte de inventario</h2>
                <p className="mt-0.5 text-xs text-app-muted">Vista consolidada del catálogo y existencias</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={scopeInv}
                  onChange={(e) => setScopeInv(e.target.value as typeof scopeInv)}
                  className="rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none"
                >
                  <option value="all">Todos los puntos</option>
                  <option value="tienda">Tienda principal</option>
                  <option value="b1">Bodega 1</option>
                  <option value="b2">Bodega 2</option>
                  <option value="b3">Bodega 3</option>
                </select>
                <ExportBtn format="pdf"  loading={busyInv === 'pdf'}  onClick={() => void dlInv('pdf')}  label="Exportar PDF" />
                <ExportBtn format="xlsx" loading={busyInv === 'xlsx'} onClick={() => void dlInv('xlsx')} label="Exportar Excel" />
              </div>
            </div>
            {errInv ? <ErrorBanner msg={errInv} /> : null}
          </div>

          {/* Tabla preview */}
          <PreviewTable<InventoryReportItem>
            loading={invQ.isLoading}
            columns={[
              { label: 'Nombre',       render: (r) => r.nombre },
              { label: 'Categoría',    render: (r) => r.categoria || '—' },
              { label: 'U/paq',        render: (r) => String(r.units_per_package), align: 'right' },
              { label: 'U/fardo',      render: (r) => String(r.units_per_fardo), align: 'right' },
              { label: 'Stock',        render: (r) => String(r.cantidad), align: 'right' },
              { label: 'P. costo',     render: (r) => fmtQ(r.precio_costo), align: 'right' },
              { label: 'P. venta',     render: (r) => fmtQ(r.precio_unitario), align: 'right' },
              {
                label: 'Estado',
                render: (r) => r.cantidad > 0
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><CheckCircle2 size={10} />Disponible</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700"><AlertCircle size={10} />Sin stock</span>,
              },
            ]}
            rows={invRows}
            emptyMsg="Sin datos de inventario."
          />
        </div>
      ) : null}

      {/* ═══════════ TAB: VENTAS POS ════════════════════════════════════ */}
      {tab === 'ventas' ? (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatPill label="Tickets registrados" value={posRows.length.toLocaleString('es-GT')} color="brand" />
            <StatPill label="Facturación total" value={`Q ${posTotal.toLocaleString('es-GT', { maximumFractionDigits: 0 })}`} color="emerald" />
            <StatPill label="Ticket promedio" value={posRows.length > 0 ? `Q ${(posTotal / posRows.length).toLocaleString('es-GT', { maximumFractionDigits: 0 })}` : '—'} color="violet" />
          </div>

          {/* Controles de exportación */}
          <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-app-text">Reporte de ventas POS</h2>
                <p className="mt-0.5 text-xs text-app-muted">Tickets y líneas de venta · PDF ejecutivo · Excel con detalle</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ExportBtn format="pdf"  loading={busyPos === 'pdf'}  onClick={() => void dlPos('pdf')}  label="Exportar PDF" />
                <ExportBtn format="xlsx" loading={busyPos === 'xlsx'} onClick={() => void dlPos('xlsx')} label="Exportar Excel" />
              </div>
            </div>
            {errPos ? <ErrorBanner msg={errPos} /> : null}
          </div>

          {/* Tabla preview */}
          <PreviewTable<PosReportSale>
            loading={posQ.isLoading}
            columns={[
              { label: '#',         render: (r) => `#${r.id}`, align: 'right' },
              { label: 'Fecha',     render: (r) => r.fecha.slice(0, 19).replace('T', ' ') },
              { label: 'Punto',     render: (r) => r.ubicacion },
              { label: 'Pago',      render: (r) => (
                <span className="rounded-full border border-app-border bg-app-bg px-2 py-0.5 text-[10px] font-semibold text-app-muted">{r.metodo_pago}</span>
              )},
              { label: 'Líneas',    render: (r) => String(r.lineas?.length ?? 0), align: 'right' },
              { label: 'Total',     render: (r) => fmtQ(r.total), align: 'right' },
            ]}
            rows={posRows}
            emptyMsg="Sin ventas registradas."
          />
        </div>
      ) : null}

      {/* ═══════════ TAB: PROVEEDORES ═══════════════════════════════════ */}
      {tab === 'proveedores' ? (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatPill label="Proveedores" value={supRows.length} color="brand" />
            <StatPill label="Órdenes de compra" value={supOrdersTotal} color="emerald" />
            <StatPill label="Con NIT registrado" value={supRows.filter(r => r.nit).length} color="violet" />
            <StatPill label="Con contacto" value={supRows.filter(r => r.contacto).length} color="amber" />
          </div>

          {/* Controles de exportación */}
          <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-app-text">Reporte de proveedores</h2>
                <p className="mt-0.5 text-xs text-app-muted">Directorio de proveedores y órdenes de compra · PDF · Excel (2 hojas)</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ExportBtn format="pdf"  loading={busySup === 'pdf'}  onClick={() => void dlSup('pdf')}  label="Exportar PDF" />
                <ExportBtn format="xlsx" loading={busySup === 'xlsx'} onClick={() => void dlSup('xlsx')} label="Exportar Excel" />
              </div>
            </div>
            {errSup ? <ErrorBanner msg={errSup} /> : null}
          </div>

          {/* Proveedores */}
          <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
            <div className="border-b border-app-border px-5 py-4 flex items-center gap-2">
              <Building2 size={15} className="text-app-muted" />
              <h3 className="text-sm font-bold text-app-text">Directorio de proveedores</h3>
            </div>
            {supQ.isLoading ? (
              <div className="flex h-32 items-center justify-center gap-2 text-sm text-app-muted">
                <Loader2 size={16} className="animate-spin" /> Cargando…
              </div>
            ) : supRows.length === 0 ? (
              <p className="p-5 text-sm text-app-muted">No hay proveedores registrados.</p>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {supRows.map((s) => (
                  <div key={s.id} className="rounded-xl border border-app-border bg-app-bg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm text-app-text">{s.nombre}</p>
                      <span className="font-mono text-[9px] text-app-subtle shrink-0">ID {s.id}</span>
                    </div>
                    {s.razon_social ? <p className="text-xs text-app-muted">{s.razon_social}</p> : null}
                    <div className="flex flex-wrap gap-3 text-[11px] text-app-muted">
                      {s.nit ? (
                        <span className="flex items-center gap-1"><Hash size={10} />{s.nit}</span>
                      ) : null}
                      {s.contacto ? (
                        <span className="flex items-center gap-1"><Phone size={10} />{s.contacto}</span>
                      ) : null}
                    </div>
                    <div className="flex gap-3 border-t border-app-border/50 pt-2">
                      <div className="text-center">
                        <p className="text-[10px] text-app-muted">Órdenes</p>
                        <p className="text-sm font-bold text-app-text">{s.total_ordenes}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-app-muted">Líneas</p>
                        <p className="text-sm font-bold text-app-text">{s.total_lineas}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Órdenes recientes */}
          <PreviewTable<PurchaseOrderReportItem>
            loading={supQ.isLoading}
            columns={[
              { label: '#',          render: (r) => `#${r.id}`, align: 'right' },
              { label: 'Proveedor',  render: (r) => r.proveedor },
              { label: 'Referencia', render: (r) => r.referencia || '—' },
              { label: 'Fecha',      render: (r) => r.fecha.slice(0, 19).replace('T', ' ') },
              { label: 'Líneas',     render: (r) => String(r.lineas), align: 'right' },
            ]}
            rows={ordRows}
            emptyMsg="Sin órdenes de compra registradas."
          />
        </div>
      ) : null}
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  )
}

type ColDef<T> = {
  label: string
  render: (row: T) => React.ReactNode
  align?: 'left' | 'right'
}

function PreviewTable<T>({
  loading,
  columns,
  rows,
  emptyMsg,
}: {
  loading: boolean
  columns: ColDef<T>[]
  rows: T[]
  emptyMsg: string
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
      <div className="border-b border-app-border px-5 py-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-app-muted uppercase tracking-wider">Vista previa</h3>
        {!loading ? (
          <span className="text-xs text-app-muted">{rows.length} registros</span>
        ) : null}
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-app-muted">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-app-muted">{emptyMsg}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-app-border bg-app-bg/50">
                {columns.map((c) => (
                  <th
                    key={c.label}
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-app-muted ${c.align === 'right' ? 'text-right' : ''}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-app-border/50 transition-colors hover:bg-app-bg/50"
                >
                  {columns.map((c) => (
                    <td
                      key={c.label}
                      className={`px-4 py-2.5 text-xs text-app-text ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* ── Tab de Ganancias ───────────────────────────────────────────────────── */

function GananciaKpi({
  label,
  value,
  hint,
  Icon,
  color = 'brand',
  big = false,
}: {
  label: string
  value: string | number
  hint?: string
  Icon: React.ElementType
  color?: 'brand' | 'emerald' | 'violet' | 'amber' | 'rose' | 'sky'
  big?: boolean
}) {
  const palette: Record<string, { bg: string; ring: string; text: string; iconBg: string; iconColor: string }> = {
    brand:   { bg: 'bg-brand-50',   ring: 'ring-brand-100',   text: 'text-brand-800',   iconBg: 'bg-brand-100',   iconColor: 'text-brand-600' },
    emerald: { bg: 'bg-emerald-50', ring: 'ring-emerald-100', text: 'text-emerald-800', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    violet:  { bg: 'bg-violet-50',  ring: 'ring-violet-100',  text: 'text-violet-800',  iconBg: 'bg-violet-100',  iconColor: 'text-violet-600' },
    amber:   { bg: 'bg-amber-50',   ring: 'ring-amber-100',   text: 'text-amber-800',   iconBg: 'bg-amber-100',   iconColor: 'text-amber-600' },
    rose:    { bg: 'bg-rose-50',    ring: 'ring-rose-100',    text: 'text-rose-800',    iconBg: 'bg-rose-100',    iconColor: 'text-rose-600' },
    sky:     { bg: 'bg-sky-50',     ring: 'ring-sky-100',     text: 'text-sky-800',     iconBg: 'bg-sky-100',     iconColor: 'text-sky-600' },
  }
  const p = palette[color]
  return (
    <div className={`rounded-2xl ${p.bg} ring-1 ${p.ring} ${big ? 'p-5' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${p.text} opacity-80`}>{label}</p>
          <p className={`mt-1 ${big ? 'text-3xl' : 'text-xl'} font-black tabular-nums ${p.text}`}>{value}</p>
          {hint ? <p className={`mt-1 text-[11px] font-medium ${p.text} opacity-70`}>{hint}</p> : null}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${p.iconBg}`}>
          <Icon size={16} className={p.iconColor} />
        </div>
      </div>
    </div>
  )
}

function DeltaPill({ pct, label }: { pct: string; label: string }) {
  const n = Number(pct)
  const positive = n > 0
  const negative = n < 0
  const Icon = positive ? TrendingUp : negative ? TrendingDown : TrendingUp
  return (
    <div
      className={
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ' +
        (positive
          ? 'bg-emerald-100 text-emerald-800'
          : negative
            ? 'bg-rose-100 text-rose-800'
            : 'bg-app-bg text-app-muted')
      }
    >
      <Icon size={12} />
      <span>
        {label} {positive ? '+' : ''}
        {pct}%
      </span>
    </div>
  )
}

function GananciasTab({
  periodo,
  setPeriodo,
  branchGan,
  setBranchGan,
  branches,
  query,
  dl,
  busy,
  err,
}: {
  periodo: GananciasPeriodo
  setPeriodo: (p: GananciasPeriodo) => void
  branchGan: number | 'all'
  setBranchGan: (b: number | 'all') => void
  branches: { id: number; name: string }[]
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchReportGananciasJson>>>>
  dl: (fmt: 'pdf' | 'xlsx') => void
  busy: 'pdf' | 'xlsx' | null
  err: string | null
}) {
  const [showDetalle, setShowDetalle] = useState(false)
  const data = query.data
  const k = data?.kpis
  const cmp = data?.comparacion

  const periodoTitulo = periodo === 'semana' ? 'esta semana' : periodo === 'quincena' ? 'esta quincena' : 'este mes'
  const periodoCorto = periodo === 'semana' ? 'semana' : periodo === 'quincena' ? 'quincena' : 'mes'
  const deltaGan = Number(cmp?.delta_ganancia_pct ?? 0)
  const tendencia: 'up' | 'down' | 'flat' =
    deltaGan > 0.5 ? 'up' : deltaGan < -0.5 ? 'down' : 'flat'

  // Para la mini gráfica: máximo de ganancia en la serie diaria
  const maxGan = (data?.serie_diaria ?? []).reduce(
    (m, r) => Math.max(m, Number(r.ganancia) || 0),
    0,
  )

  return (
    <div className="space-y-5">
      {/* Filtros + export */}
      <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 items-center gap-1 rounded-xl border border-app-border bg-app-bg p-1">
              {(['semana', 'quincena', 'mes'] as GananciasPeriodo[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodo(p)}
                  className={
                    'rounded-lg px-3 py-1 text-xs font-bold transition ' +
                    (periodo === p
                      ? 'bg-app-surface text-app-text shadow-sm'
                      : 'text-app-muted hover:text-app-text')
                  }
                >
                  {p === 'semana' ? 'Semana' : p === 'quincena' ? 'Quincena' : 'Mes'}
                </button>
              ))}
            </div>
            <select
              value={branchGan}
              onChange={(e) => setBranchGan(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="h-9 rounded-xl border border-app-border bg-app-bg px-3 text-sm font-semibold text-app-text outline-none"
            >
              <option value="all">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ExportBtn format="pdf"  loading={busy === 'pdf'}  onClick={() => dl('pdf')}  label="Exportar PDF" />
            <ExportBtn format="xlsx" loading={busy === 'xlsx'} onClick={() => dl('xlsx')} label="Exportar Excel" />
          </div>
        </div>
        {err ? <ErrorBanner msg={err} /> : null}
      </div>

      {query.isLoading || !data || !k || !cmp ? (
        <div className="rounded-2xl border border-app-border bg-app-surface p-12 text-center text-sm text-app-muted">
          <Loader2 size={20} className="mx-auto animate-spin text-app-muted" />
          <p className="mt-2">Calculando ganancias…</p>
        </div>
      ) : (
        <>
          {/* ── Resumen narrativo (la pregunta principal: ¿gané o no?) ─────── */}
          <div
            className="relative overflow-hidden rounded-2xl px-6 py-6 text-white shadow-card"
            style={{
              background:
                tendencia === 'up'
                  ? 'linear-gradient(135deg, #064e3b 0%, #047857 60%, #10b981 100%)'
                  : tendencia === 'down'
                    ? 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 60%, #ef4444 100%)'
                    : 'linear-gradient(135deg, #1e293b 0%, #334155 60%, #475569 100%)',
            }}
          >
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/70">
                  Resumen de {periodoTitulo}
                </p>
                <p className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
                  {tendencia === 'down' ? 'Perdiste ' : 'Ganaste '}
                  <span className="text-white">Q {k.ganancia_neta}</span>
                </p>
                <p className="mt-1 text-sm text-white/80">
                  en <span className="font-bold text-white">{k.tickets}</span> ventas ·{' '}
                  Margen de <span className="font-bold text-white">{k.margen_pct}%</span>
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-white/15 px-5 py-4 backdrop-blur-sm">
                {tendencia === 'up' ? (
                  <TrendingUp size={36} className="text-white" />
                ) : tendencia === 'down' ? (
                  <TrendingDown size={36} className="text-white" />
                ) : (
                  <DollarSign size={36} className="text-white" />
                )}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">
                    vs {periodoCorto} anterior
                  </p>
                  <p className="text-2xl font-black tabular-nums text-white">
                    {deltaGan > 0 ? '+' : ''}
                    {cmp.delta_ganancia_pct}%
                  </p>
                  <p className="text-[11px] text-white/80">
                    {tendencia === 'up'
                      ? 'mejor que antes'
                      : tendencia === 'down'
                        ? 'peor que antes'
                        : 'sin cambios'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── 3 KPIs principales ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <GananciaKpi
              label="Ganancia"
              value={`Q ${k.ganancia_neta}`}
              hint={`${k.margen_pct}% de margen`}
              Icon={PiggyBank}
              color="emerald"
              big
            />
            <GananciaKpi
              label="Ventas totales"
              value={`Q ${k.ventas_brutas}`}
              hint={`${k.tickets} tickets · prom. Q ${k.ticket_promedio}`}
              Icon={DollarSign}
              color="brand"
              big
            />
            <GananciaKpi
              label="Costo de mercancía"
              value={`Q ${k.costo}`}
              hint={`${k.unidades.toLocaleString('es-GT')} unidades vendidas`}
              Icon={Boxes}
              color="amber"
              big
            />
          </div>

          {/* ── Mini gráfica de tendencia diaria ─────────────────────────── */}
          {data.serie_diaria.length > 0 ? (
            <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-app-text">Ganancia diaria</h3>
                <span className="text-xs text-app-muted">
                  {data.serie_diaria.length} día{data.serie_diaria.length !== 1 ? 's' : ''} con ventas
                </span>
              </div>
              <div className="flex h-32 items-end gap-1.5">
                {data.serie_diaria.map((r, i) => {
                  const value = Number(r.ganancia) || 0
                  const heightPct = maxGan > 0 ? Math.max(2, (value / maxGan) * 100) : 2
                  const positive = value >= 0
                  return (
                    <div
                      key={i}
                      className="group relative flex flex-1 flex-col items-center"
                      title={`${r.fecha}: Q ${r.ganancia} ganancia · ${r.tickets} tickets`}
                    >
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className={
                            'w-full rounded-t-md transition-opacity group-hover:opacity-80 ' +
                            (positive ? 'bg-emerald-500' : 'bg-rose-500')
                          }
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className="mt-1 text-[9px] font-bold tabular-nums text-app-muted">
                        {(r.fecha ?? '').slice(8, 10)}/{(r.fecha ?? '').slice(5, 7)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* ── Top 5 productos visual ───────────────────────────────────── */}
          {data.top_productos.length > 0 ? (
            <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-app-text">Productos que más dejaron ganancia</h3>
                <span className="text-xs text-app-muted">Top {Math.min(5, data.top_productos.length)}</span>
              </div>
              <div className="space-y-2">
                {data.top_productos.slice(0, 5).map((p, i) => {
                  const ganancia = Number(p.ganancia) || 0
                  const maxTopGan = Number(data.top_productos[0].ganancia) || 1
                  const widthPct = Math.max(4, (ganancia / maxTopGan) * 100)
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-800">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-bold text-app-text">{p.nombre || p.sku}</p>
                          <p className="text-sm font-black tabular-nums text-emerald-700">
                            {fmtQ(p.ganancia)}
                          </p>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-app-bg">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <p className="shrink-0 text-[11px] text-app-muted tabular-nums">
                            {p.unidades} u · {fmtQ(p.ingresos)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* ── Por sucursal (compacto, solo si hay >1) ──────────────────── */}
          {data.por_sucursal.length > 1 ? (
            <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-app-text">Ganancia por sucursal</h3>
                <Building2 size={14} className="text-app-muted" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.por_sucursal.map((b) => (
                  <div key={b.branch_name} className="rounded-xl border border-app-border bg-app-bg p-3">
                    <p className="text-xs font-semibold text-app-muted">{b.branch_name}</p>
                    <p className="mt-1 text-lg font-black tabular-nums text-emerald-700">
                      {fmtQ(b.ganancia)}
                    </p>
                    <p className="text-[11px] text-app-muted">
                      {b.tickets} tickets · margen {b.margen_pct}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Toggle "ver detalle" ─────────────────────────────────────── */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowDetalle((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-surface px-4 py-2 text-sm font-bold text-app-text shadow-sm transition hover:bg-app-bg"
            >
              {showDetalle ? 'Ocultar detalle' : 'Ver detalle completo'}
              <span className={'transition ' + (showDetalle ? 'rotate-180' : '')}>↓</span>
            </button>
          </div>
        </>
      )}

      {showDetalle && data && k && cmp ? (
        <>
          {/* Sub KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <GananciaKpi label="Unidades vendidas" value={k.unidades.toLocaleString('es-GT')} Icon={Boxes} color="violet" />
            <GananciaKpi label="Ticket promedio" value={`Q ${k.ticket_promedio}`} Icon={DollarSign} color="brand" />
            <GananciaKpi label="Ganancia / ticket" value={`Q ${k.ganancia_promedio}`} Icon={PiggyBank} color="emerald" />
            <GananciaKpi label="Descuentos otorgados" value={`Q ${k.descuentos}`} Icon={Percent} color="rose" />
          </div>

          {/* Comparación con el periodo anterior */}
          <div className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-app-muted" />
                <h3 className="text-sm font-bold text-app-text">Comparación con el periodo anterior</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DeltaPill pct={cmp.delta_ventas_pct}    label="Ventas" />
                <DeltaPill pct={cmp.delta_ganancia_pct}  label="Ganancia" />
                <DeltaPill pct={cmp.delta_tickets_pct}   label="Tickets" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-app-border bg-app-bg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">Ventas previas</p>
                <p className="text-base font-black tabular-nums text-app-text">Q {cmp.ventas_prev}</p>
              </div>
              <div className="rounded-xl border border-app-border bg-app-bg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">Ganancia previa</p>
                <p className="text-base font-black tabular-nums text-app-text">Q {cmp.ganancia_prev}</p>
              </div>
              <div className="rounded-xl border border-app-border bg-app-bg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">Tickets previos</p>
                <p className="text-base font-black tabular-nums text-app-text">{cmp.tickets_prev}</p>
              </div>
            </div>
          </div>

          {/* Serie diaria */}
          <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">Detalle diario</h3>
              <span className="text-xs text-app-muted">{data.serie_diaria.length} días con ventas</span>
            </div>
            {data.serie_diaria.length === 0 ? (
              <p className="p-5 text-sm text-app-muted">Sin ventas en el periodo seleccionado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-app-border bg-app-bg/50">
                      <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-app-muted">Fecha</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-app-muted">Tickets</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-app-muted">Unid.</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-app-muted">Ingresos</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-app-muted">Costo</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-app-muted">Desc.</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-app-muted">Ganancia</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-app-muted">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.serie_diaria.map((r, i) => (
                      <tr key={i} className="border-b border-app-border/50 hover:bg-app-bg/50">
                        <td className="px-4 py-2 text-xs font-semibold text-app-text">{r.fecha}</td>
                        <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{r.tickets}</td>
                        <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{r.unidades}</td>
                        <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{fmtQ(r.ingresos)}</td>
                        <td className="px-4 py-2 text-right text-xs text-app-muted tabular-nums">{fmtQ(r.costo)}</td>
                        <td className="px-4 py-2 text-right text-xs text-rose-700 tabular-nums">{fmtQ(r.descuento)}</td>
                        <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">{fmtQ(r.ganancia)}</td>
                        <td className="px-4 py-2 text-right text-xs text-app-muted tabular-nums">{r.margen_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top productos */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">Top productos por ganancia</h3>
                <span className="text-xs text-app-muted">{data.top_productos.length}</span>
              </div>
              {data.top_productos.length === 0 ? (
                <p className="p-5 text-sm text-app-muted">Sin datos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-app-border bg-app-bg/50">
                        <th className="px-4 py-2 text-[11px] font-semibold uppercase text-app-muted">Producto</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Unid.</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Ingreso</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Ganancia</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_productos.map((p) => (
                        <tr key={p.id} className="border-b border-app-border/50 hover:bg-app-bg/50">
                          <td className="px-4 py-2 text-xs text-app-text">
                            <p className="font-bold">{p.nombre || p.sku}</p>
                            <p className="text-[10px] text-app-muted">{p.sku} {p.categoria ? '· ' + p.categoria : ''}</p>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{p.unidades}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{fmtQ(p.ingresos)}</td>
                          <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">{fmtQ(p.ganancia)}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-muted tabular-nums">{p.margen_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Top categorías */}
            <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">Por categoría</h3>
                <span className="text-xs text-app-muted">{data.top_categorias.length}</span>
              </div>
              {data.top_categorias.length === 0 ? (
                <p className="p-5 text-sm text-app-muted">Sin datos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-app-border bg-app-bg/50">
                        <th className="px-4 py-2 text-[11px] font-semibold uppercase text-app-muted">Categoría</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Productos</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Ingreso</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Ganancia</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_categorias.map((c, i) => (
                        <tr key={i} className="border-b border-app-border/50 hover:bg-app-bg/50">
                          <td className="px-4 py-2 text-xs font-semibold text-app-text">{c.categoria}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{c.productos}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{fmtQ(c.ingresos)}</td>
                          <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">{fmtQ(c.ganancia)}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-muted tabular-nums">{c.margen_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Por sucursal + métodos de pago */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">Por sucursal</h3>
                <Building2 size={14} className="text-app-muted" />
              </div>
              {data.por_sucursal.length === 0 ? (
                <p className="p-5 text-sm text-app-muted">Sin datos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-app-border bg-app-bg/50">
                        <th className="px-4 py-2 text-[11px] font-semibold uppercase text-app-muted">Sucursal</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Tickets</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Ingreso</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Ganancia</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_sucursal.map((b, i) => (
                        <tr key={i} className="border-b border-app-border/50 hover:bg-app-bg/50">
                          <td className="px-4 py-2 text-xs font-semibold text-app-text">{b.branch_name}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{b.tickets}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{fmtQ(b.ingresos)}</td>
                          <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">{fmtQ(b.ganancia)}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-muted tabular-nums">{b.margen_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Métodos de pago */}
              <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">Métodos de pago</h3>
                  <span className="text-xs text-app-muted">{data.por_pago.length}</span>
                </div>
                {data.por_pago.length === 0 ? (
                  <p className="p-5 text-sm text-app-muted">Sin datos.</p>
                ) : (
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-app-border bg-app-bg/50">
                        <th className="px-4 py-2 text-[11px] font-semibold uppercase text-app-muted">Método</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Tickets</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_pago.map((r, i) => (
                        <tr key={i} className="border-b border-app-border/50 hover:bg-app-bg/50">
                          <td className="px-4 py-2 text-xs font-semibold text-app-text">{r.metodo_label}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{r.tickets}</td>
                          <td className="px-4 py-2 text-right text-xs font-bold text-app-text tabular-nums">{fmtQ(r.ventas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Estado de pago */}
              <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">Estado de pago</h3>
                  <span className="text-xs text-app-muted">{data.por_estado.length}</span>
                </div>
                {data.por_estado.length === 0 ? (
                  <p className="p-5 text-sm text-app-muted">Sin datos.</p>
                ) : (
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-app-border bg-app-bg/50">
                        <th className="px-4 py-2 text-[11px] font-semibold uppercase text-app-muted">Estado</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Tickets</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Total</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_estado.map((r, i) => (
                        <tr key={i} className="border-b border-app-border/50 hover:bg-app-bg/50">
                          <td className="px-4 py-2 text-xs font-semibold text-app-text">{r.estado_label}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{r.tickets}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{fmtQ(r.ventas)}</td>
                          <td className="px-4 py-2 text-right text-xs text-rose-700 tabular-nums">{fmtQ(r.pendiente)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Top clientes y top tickets */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">Top clientes por ganancia</h3>
                <Users size={14} className="text-app-muted" />
              </div>
              {data.top_clientes.length === 0 ? (
                <p className="p-5 text-sm text-app-muted">Sin datos.</p>
              ) : (
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-app-border bg-app-bg/50">
                      <th className="px-4 py-2 text-[11px] font-semibold uppercase text-app-muted">Cliente</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Tickets</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Ingreso</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Ganancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_clientes.map((c, i) => (
                      <tr key={i} className="border-b border-app-border/50 hover:bg-app-bg/50">
                        <td className="px-4 py-2 text-xs">
                          <p className="font-semibold text-app-text">{c.nombre}</p>
                          {c.nit ? <p className="text-[10px] text-app-muted">NIT {c.nit}</p> : null}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{c.tickets}</td>
                        <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{fmtQ(c.ingresos)}</td>
                        <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">{fmtQ(c.ganancia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-2xl border border-app-border bg-app-surface shadow-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">Tickets más rentables</h3>
                <span className="text-xs text-app-muted">{data.top_tickets.length}</span>
              </div>
              {data.top_tickets.length === 0 ? (
                <p className="p-5 text-sm text-app-muted">Sin datos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-app-border bg-app-bg/50">
                        <th className="px-4 py-2 text-[11px] font-semibold uppercase text-app-muted">Ticket</th>
                        <th className="px-4 py-2 text-[11px] font-semibold uppercase text-app-muted">Cliente</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Total</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-app-muted">Ganancia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_tickets.map((t) => (
                        <tr key={t.id} className="border-b border-app-border/50 hover:bg-app-bg/50">
                          <td className="px-4 py-2 text-xs">
                            <p className="font-mono font-bold text-app-text">#{t.id}</p>
                            <p className="text-[10px] text-app-muted">
                              {new Date(t.fecha).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })} · {t.sucursal}
                            </p>
                          </td>
                          <td className="px-4 py-2 text-xs text-app-text">{t.cliente}</td>
                          <td className="px-4 py-2 text-right text-xs text-app-text tabular-nums">{fmtQ(t.total)}</td>
                          <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">{fmtQ(t.ganancia)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
