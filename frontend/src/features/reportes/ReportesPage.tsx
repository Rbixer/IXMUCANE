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
} from 'lucide-react'
import {
  downloadReportFile,
  fetchReportInventoryJson,
  fetchReportPosJson,
  fetchReportSuppliersJson,
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
  const [tab, setTab] = useState<'inventario' | 'ventas' | 'proveedores'>('inventario')
  const [busyInv, setBusyInv] = useState<'pdf' | 'xlsx' | null>(null)
  const [busyPos, setBusyPos] = useState<'pdf' | 'xlsx' | null>(null)
  const [busySup, setBusySup] = useState<'pdf' | 'xlsx' | null>(null)
  const [errInv, setErrInv] = useState<string | null>(null)
  const [errPos, setErrPos] = useState<string | null>(null)
  const [errSup, setErrSup] = useState<string | null>(null)
  const [scopeInv, setScopeInv] = useState<'all' | 'tienda' | 'b1' | 'b2' | 'b3'>('all')

  const branchesQ = useQuery({ queryKey: ['branches'], queryFn: listBranches, staleTime: 120_000 })
  const invQ      = useQuery({ queryKey: ['reports', 'inventario', 'all'], queryFn: () => fetchReportInventoryJson() })
  const posQ      = useQuery({ queryKey: ['reports', 'sistema-pos', 'all'], queryFn: () => fetchReportPosJson() })
  const supQ      = useQuery({ queryKey: ['reports', 'proveedores', 'all'], queryFn: () => fetchReportSuppliersJson() })

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
        <Tab id="inv" active={tab === 'inventario'} onClick={() => setTab('inventario')} Icon={Boxes}    label="Inventario"  count={invRows.length} />
        <Tab id="pos" active={tab === 'ventas'}     onClick={() => setTab('ventas')}     Icon={Store}    label="Ventas POS"  count={posRows.length} />
        <Tab id="sup" active={tab === 'proveedores'} onClick={() => setTab('proveedores')} Icon={Truck}  label="Proveedores" count={supRows.length} />
      </div>

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
