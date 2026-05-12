import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, CreditCard, Download, Eye, FileText, Filter, Receipt, Search, X } from 'lucide-react'
import { fetchPosSale, listPosSales, patchPosSaleStatus, posSaleFromListItem } from './pos.service'
import { descargarFelXmlsZip, descargarXmlCertificado } from '../fel/fel.service'
import { SaleReceiptModal } from './SaleReceiptModal'
import { api } from '../../shared/api/client'
import { downloadCobrosReport, saleFacturaPdfUrl, saleFacturaTicketPdfUrl } from '../reportes/reportes.service'
import { notifyError, notifySuccess } from '../../shared/lib/notify'
import type { PaymentStatus, PosSale, PosSaleListItem } from './pos.service'

const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', other: 'Otro' }
const PAYMENT_STYLES: Record<string, { bg: string; color: string }> = {
  cash:  { bg: '#F0FDF4', color: '#15803D' },
  card:  { bg: '#EFF6FF', color: '#1D4ED8' },
  other: { bg: '#F9FAFB', color: '#374151' },
}

const STATUS_LABELS: Record<string, string> = { paid: 'Pagado', credit: 'Crédito', pending: 'Pendiente' }
const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  paid:    { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  credit:  { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  pending: { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
}
const STATUS_ICONS = {
  paid: CheckCircle2,
  credit: CreditCard,
  pending: Clock3,
} as const

type StatusFilter = 'all' | PaymentStatus
type FelFilter = 'all' | 'certificado' | 'pendiente' | 'rechazado' | 'error' | 'sin'

const FEL_BADGE: Record<
  'certificado' | 'pendiente' | 'rechazado' | 'error' | 'sin',
  { label: string; bg: string; color: string; border: string }
> = {
  certificado: { label: 'Certificada',  bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' },
  pendiente:   { label: 'Pendiente',    bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
  rechazado:   { label: 'Rechazada',    bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
  error:       { label: 'Error',        bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
  sin:         { label: 'Sin emitir',   bg: '#F3F4F6', color: '#4B5563', border: '#E5E7EB' },
}

function formatQ(s: string) {
  const n = Number(s)
  return Number.isFinite(n)
    ? `Q ${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : s
}

export function PosFacturasPage() {
  const queryClient = useQueryClient()
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [downloadingTicketId, setDownloadingTicketId] = useState<number | null>(null)
  const [downloadingFelId, setDownloadingFelId] = useState<number | null>(null)
  const [downloadingFelZip, setDownloadingFelZip] = useState(false)
  const [previewSale, setPreviewSale] = useState<PosSale | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [felFilter, setFelFilter] = useState<FelFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [cobrosDownloading, setCobrosDownloading] = useState(false)
  const [collectTarget, setCollectTarget] = useState<PosSaleListItem | null>(null)
  const [abonoInput, setAbonoInput] = useState('')

  const salesQuery = useQuery({
    queryKey: ['pos', 'sales', 'facturas', 'all'],
    queryFn: () => listPosSales(),
  })

  const collectMutation = useMutation({
    mutationFn: ({ id, payment_abono }: { id: number; payment_abono: number }) =>
      patchPosSaleStatus(id, { payment_abono }),
    onSuccess: () => {
      notifySuccess('Abono registrado.')
      setCollectTarget(null)
      setAbonoInput('')
      void queryClient.invalidateQueries({ queryKey: ['pos', 'sales'] })
    },
    onError: (e: Error) => notifyError(e.message),
  })

  const openCollectModal = (row: PosSaleListItem) => {
    setCollectTarget(row)
    const due =
      Number(row.balance_due) ||
      Math.max(0, Number(row.total) - Number(row.amount_paid ?? 0))
    setAbonoInput(due > 0 ? String(due) : '')
  }

  const collectPreview = useMemo(() => {
    if (!collectTarget) return { total: 0, paid: 0, abono: 0, afterPaid: 0, queda: 0 }
    const total = Number(collectTarget.total) || 0
    const paid = Number(collectTarget.amount_paid) || 0
    const raw = abonoInput.trim().replace(',', '.')
    const abono = parseFloat(raw)
    const abonoOk = Number.isFinite(abono) && abono >= 0 ? abono : 0
    const afterPaid = Math.min(total, paid + abonoOk)
    const queda = Math.max(0, total - afterPaid)
    return { total, paid, abono: abonoOk, afterPaid, queda }
  }, [collectTarget, abonoInput])

  const allRows = salesQuery.data ?? []

  const filteredRows = useMemo(() => {
    let rows = allRows
    if (statusFilter !== 'all') {
      rows = rows.filter((r) => (r.payment_status ?? 'paid') === statusFilter)
    }
    if (felFilter !== 'all') {
      rows = rows.filter((r) => {
        const e = r.fel?.estado
        if (felFilter === 'sin') return !e
        return e === felFilter
      })
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime()
      rows = rows.filter((r) => new Date(r.created_at).getTime() >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86_400_000
      rows = rows.filter((r) => new Date(r.created_at).getTime() <= to)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          String(r.id).includes(q) ||
          (r.customer_name ?? '').toLowerCase().includes(q) ||
          (r.customer_phone ?? '').toLowerCase().includes(q) ||
          new Date(r.created_at).toLocaleDateString('es-GT').includes(q),
      )
    }
    return rows
  }, [allRows, statusFilter, felFilter, dateFrom, dateTo, search])

  const felCount = useMemo(
    () => allRows.filter((r) => r.fel?.estado === 'certificado').length,
    [allRows],
  )

  const totalFacturado = useMemo(() => allRows.reduce((s, r) => s + (Number(r.total) || 0), 0), [allRows])
  const last7 = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000
    return allRows.filter((r) => new Date(r.created_at).getTime() >= cutoff)
  }, [allRows])
  const pendingRows = useMemo(() => allRows.filter((r) => (r.payment_status ?? 'paid') !== 'paid'), [allRows])
  const pendingTotal = useMemo(() => pendingRows.reduce((s, r) => s + (Number(r.total) || 0), 0), [pendingRows])

  const downloadFelXml = async (saleId: number) => {
    setDownloadingFelId(saleId)
    try {
      await descargarXmlCertificado(saleId)
      notifySuccess('XML certificado descargado.')
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'No se pudo descargar el XML.')
    } finally {
      setDownloadingFelId(null)
    }
  }

  const handleDownloadFelZip = async () => {
    setDownloadingFelZip(true)
    try {
      await descargarFelXmlsZip({ from: dateFrom || undefined, to: dateTo || undefined })
      notifySuccess('ZIP de XMLs certificados descargado.')
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'No se pudo descargar el ZIP.')
    } finally {
      setDownloadingFelZip(false)
    }
  }

  const downloadPdfVariant = async (saleId: number, variant: 'factura' | 'ticket') => {
    if (variant === 'ticket') setDownloadingTicketId(saleId)
    else setDownloadingId(saleId)
    try {
      const path = variant === 'ticket'
        ? saleFacturaTicketPdfUrl(saleId)
        : saleFacturaPdfUrl(saleId)
      const { data } = await api.get(path, { responseType: 'blob' })
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = variant === 'ticket' ? `ticket_${saleId}.pdf` : `factura_${saleId}.pdf`
      a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'No se pudo descargar el PDF.')
    } finally {
      if (variant === 'ticket') setDownloadingTicketId(null)
      else setDownloadingId(null)
    }
  }

  const openReceiptPreview = async (row: PosSaleListItem) => {
    const fromList = posSaleFromListItem(row)
    if (fromList) { setPreviewSale(fromList); return }
    setPreviewLoadingId(row.id)
    try { setPreviewSale(await fetchPosSale(row.id)) }
    catch (e) { notifyError(e instanceof Error ? e.message : 'No se pudo cargar la venta.') }
    finally { setPreviewLoadingId(null) }
  }

  const handleDownloadCobros = async () => {
    setCobrosDownloading(true)
    try { await downloadCobrosReport(); notifySuccess('Reporte descargado.') }
    catch (e) { notifyError(e instanceof Error ? e.message : 'Error al descargar.') }
    finally { setCobrosDownloading(false) }
  }

  const STATUS_FILTER_OPTIONS: { key: StatusFilter; label: string; color: string }[] = [
    { key: 'all',     label: 'Todos',     color: '' },
    { key: 'paid',    label: 'Pagados',   color: '#15803D' },
    { key: 'credit',  label: 'Crédito',   color: '#1D4ED8' },
    { key: 'pending', label: 'Pendiente', color: '#B45309' },
  ]

  const submitAbono = () => {
    if (!collectTarget) return
    const v = parseFloat(abonoInput.trim().replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) {
      notifyError('Indique un abono mayor que cero.')
      return
    }
    collectMutation.mutate({ id: collectTarget.id, payment_abono: v })
  }

  return (
    <div className="mx-auto w-full max-w-[min(100%,72rem)] space-y-4">
      <SaleReceiptModal sale={previewSale} onClose={() => setPreviewSale(null)} variant="preview" showPrintButton />

      {collectTarget ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="collect-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="collect-modal-title" className="text-base font-bold text-gray-900">
                  Registrar abono
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">Venta #{collectTarget.id}</p>
              </div>
              <button
                type="button"
                onClick={() => { setCollectTarget(null); setAbonoInput('') }}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-2 text-gray-600">
                <span>Total venta</span>
                <span className="font-bold tabular-nums text-gray-900">{formatQ(collectTarget.total)}</span>
              </div>
              <div className="flex justify-between gap-2 text-gray-600">
                <span>Ya pagado</span>
                <span className="font-semibold tabular-nums text-gray-800">
                  {formatQ(collectTarget.amount_paid ?? '0')}
                </span>
              </div>
              <div className="flex justify-between gap-2 border-t border-gray-100 pt-2 text-gray-600">
                <span>Saldo antes del abono</span>
                <span className="font-bold tabular-nums text-amber-800">
                  {formatQ(
                    collectTarget.balance_due ??
                      String(Math.max(0, Number(collectTarget.total) - Number(collectTarget.amount_paid ?? 0))),
                  )}
                </span>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-gray-700">Abono del cliente (Q)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={abonoInput}
                  onChange={(e) => setAbonoInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-base font-semibold tabular-nums text-gray-900 outline-none ring-emerald-500/30 focus:ring-2"
                  autoFocus
                />
              </label>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Quedaría por pagar</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-emerald-900">
                  {formatQ(String(collectPreview.queda))}
                </p>
                <p className="mt-1 text-[10px] text-emerald-700/90">
                  Tras este abono: pagado acumulado {formatQ(String(collectPreview.afterPaid))} de{' '}
                  {formatQ(collectTarget.total)}
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCollectTarget(null); setAbonoInput('') }}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={collectMutation.isPending}
                onClick={submitAbono}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                {collectMutation.isPending ? 'Guardando…' : 'Confirmar abono'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Hero header ──────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-5 text-white"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)' }}
      >
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, #DC2626 0%, transparent 60%)' }} />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tight">Historial de ventas</h1>
            <p className="mt-0.5 text-[13px] font-medium text-white/60">
              Tickets · Recibos · Descarga PDF individual
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {felCount > 0 ? (
              <button
                type="button"
                onClick={() => void handleDownloadFelZip()}
                disabled={downloadingFelZip}
                className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/20 px-4 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-400/30 disabled:opacity-60"
                title={
                  dateFrom || dateTo
                    ? `ZIP de XMLs certificados ${dateFrom || '…'} → ${dateTo || '…'}`
                    : 'ZIP de todos los XMLs certificados'
                }
              >
                <Download size={14} />
                {downloadingFelZip ? 'Descargando…' : 'ZIP XMLs FEL'}
              </button>
            ) : null}
            {pendingRows.length > 0 ? (
              <button
                type="button"
                onClick={() => void handleDownloadCobros()}
                disabled={cobrosDownloading}
                className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/20 px-4 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-400/30 disabled:opacity-60"
              >
                <Download size={14} />
                {cobrosDownloading ? 'Descargando…' : 'PDF Cuentas por cobrar'}
              </button>
            ) : null}
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Total tickets',    value: allRows.length, fmt: 'n' },
            { label: 'Facturado total',  value: totalFacturado, fmt: 'q' },
            { label: 'Últimos 7 días',   value: last7.length,   fmt: 'n' },
            { label: 'FEL certificadas', value: felCount,       fmt: 'n' },
            { label: 'Por cobrar',       value: pendingTotal,   fmt: 'q', accent: pendingTotal > 0 },
          ].map(({ label, value, fmt, accent }) => (
            <div key={label} className={`rounded-xl px-4 py-3 backdrop-blur-sm ${accent ? 'bg-amber-400/25 border border-amber-400/30' : 'bg-white/10'}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</p>
              <p className="mt-0.5 font-black tabular-nums text-white" style={{ fontSize: fmt === 'q' && value > 9999 ? 15 : 22 }}>
                {fmt === 'q' ? `Q ${(value as number).toLocaleString('es-GT', { minimumFractionDigits: 0 })}` : value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* Barra de filtros */}
        <div className="border-b border-gray-100 px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-gray-500">
              <Receipt size={17} />
              <span className="text-sm font-bold text-gray-700">
                {filteredRows.length} {filteredRows.length === 1 ? 'venta' : 'ventas'}
              </span>
            </div>
            <div className="relative w-full max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:bg-white focus:ring-2 focus:ring-red-100"
                placeholder="Buscar por # ticket, cliente o fecha…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Filtros de estado + fecha */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={13} className="shrink-0 text-gray-400" />
            <div className="flex gap-1.5">
              {STATUS_FILTER_OPTIONS.map(({ key, label, color }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={[
                    'rounded-full px-3 py-1 text-[11px] font-bold transition',
                    statusFilter === key
                      ? 'bg-gray-800 text-white'
                      : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100',
                  ].join(' ')}
                  style={statusFilter === key && color ? { background: color } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">FEL</span>
            <div className="flex gap-1.5">
              {([
                { key: 'all',         label: 'Todas' },
                { key: 'certificado', label: 'Certificadas' },
                { key: 'pendiente',   label: 'Pendientes' },
                { key: 'rechazado',   label: 'Rechazadas' },
                { key: 'sin',         label: 'Sin FEL' },
              ] as { key: FelFilter; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFelFilter(key)}
                  className={[
                    'rounded-full px-3 py-1 text-[11px] font-bold transition',
                    felFilter === key
                      ? 'bg-gray-800 text-white'
                      : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100"
                title="Desde"
              />
              <span className="text-xs text-gray-400">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100"
                title="Hasta"
              />
              {(dateFrom || dateTo) ? (
                <button type="button" onClick={() => { setDateFrom(''); setDateTo('') }}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-bold text-gray-500 hover:text-red-500">
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {salesQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm font-medium text-gray-400">Cargando ventas…</div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Receipt size={32} className="text-gray-200" />
            <p className="text-sm font-bold text-gray-400">{search ? 'Sin resultados' : 'No hay ventas registradas'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-50">
              <thead>
                <tr style={{ background: '#1a1a2e' }}>
                  {['Ticket', 'Fecha', 'Cliente', 'Pago', 'Estado', 'Productos', 'Total', 'FEL', 'Acciones'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-white/70">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRows.map((r, idx) => {
                  const pmStyle  = PAYMENT_STYLES[r.payment_method]  ?? PAYMENT_STYLES.other
                  const psStatus = r.payment_status ?? 'paid'
                  const psStyle  = STATUS_STYLES[psStatus] ?? STATUS_STYLES.paid
                  const StatusIcon = STATUS_ICONS[psStatus as keyof typeof STATUS_ICONS] ?? CheckCircle2
                  const isPending = psStatus !== 'paid'
                  return (
                    <tr
                      key={r.id}
                      className="transition-colors hover:bg-red-50/40"
                      style={{ background: idx % 2 === 1 ? '#f9fafb' : '#ffffff' }}
                    >
                      {/* Ticket */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 font-mono text-xs font-black text-gray-700">
                          #{r.id}
                        </span>
                      </td>
                      {/* Fecha */}
                      <td className="px-4 py-3">
                        <p className="text-xs font-bold text-gray-800">
                          {new Date(r.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(r.created_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                      {/* Cliente */}
                      <td className="px-4 py-3">
                        {r.customer_name ? (
                          <div>
                            <p className="text-xs font-bold text-gray-800">{r.customer_name}</p>
                            <p className="text-[10px] text-gray-400">{r.customer_phone || r.customer_email || 'Sin contacto'}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">Consumidor final</span>
                        )}
                      </td>
                      {/* Método de pago */}
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black" style={pmStyle}>
                          {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
                        </span>
                      </td>
                      {/* Estado de pago */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black"
                            style={{ background: psStyle.bg, color: psStyle.color, border: `1px solid ${psStyle.border}` }}
                          >
                            <StatusIcon size={12} />
                            {STATUS_LABELS[psStatus] ?? psStatus}
                          </span>
                          {psStatus === 'credit' && r.credit_days > 0 ? (
                            <span className="text-[10px] text-blue-500 font-semibold">{r.credit_days}d plazo</span>
                          ) : null}
                          {isPending && r.credit_note ? (
                            <span className="max-w-[120px] truncate text-[10px] text-gray-400" title={r.credit_note}>
                              {r.credit_note}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {/* Productos */}
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold text-gray-700">
                          {r.lines_count} ítem{r.lines_count !== 1 ? 's' : ''}
                        </span>
                        <p className="text-[10px] text-gray-400">{r.total_units} u.</p>
                      </td>
                      {/* Total */}
                      <td className="px-4 py-3">
                        <span className="text-sm font-black tabular-nums text-gray-900">{formatQ(r.total)}</span>
                        {isPending ? (
                          <p className="mt-0.5 text-[10px] font-bold text-amber-700">
                            Pendiente:{' '}
                            {formatQ(
                              r.balance_due ??
                                String(Math.max(0, Number(r.total) - Number(r.amount_paid ?? 0))),
                            )}
                          </p>
                        ) : null}
                      </td>
                      {/* FEL */}
                      <td className="px-4 py-3">
                        {(() => {
                          if (r.is_envio) {
                            return (
                              <span
                                className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black"
                                style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
                                title="Esta venta se procesó como envío y no se certificó FEL."
                              >
                                Envío
                              </span>
                            )
                          }
                          const e = (r.fel?.estado ?? 'sin') as keyof typeof FEL_BADGE
                          const f = FEL_BADGE[e]
                          const isCertified = r.fel?.estado === 'certificado'
                          return (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black"
                                  style={{ background: f.bg, color: f.color, border: `1px solid ${f.border}` }}
                                >
                                  {f.label}
                                </span>
                                {isCertified ? (
                                  <button
                                    type="button"
                                    onClick={() => void downloadFelXml(r.id)}
                                    disabled={downloadingFelId === r.id}
                                    title="Descargar XML certificado por SAT"
                                    className="flex items-center justify-center rounded-md border border-emerald-200 bg-white p-1 text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                                  >
                                    <Download size={11} />
                                  </button>
                                ) : null}
                              </div>
                              {isCertified && r.fel?.serie && r.fel?.numero_autorizacion ? (
                                <span
                                  className="font-mono text-[10px] text-gray-500"
                                  title={`Autorización: ${r.fel.numero_autorizacion}`}
                                >
                                  {r.fel.serie}-{r.fel.numero_autorizacion.slice(0, 8)}…
                                </span>
                              ) : null}
                            </div>
                          )
                        })()}
                      </td>
                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={previewLoadingId === r.id}
                            onClick={() => void openReceiptPreview(r)}
                            title="Ver recibo"
                            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Eye size={13} />
                            {previewLoadingId === r.id ? '…' : 'Ver'}
                          </button>
                          <button
                            type="button"
                            disabled={downloadingId === r.id}
                            onClick={() => void downloadPdfVariant(r.id, 'factura')}
                            title="Factura PDF (carta) con datos FEL"
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white transition disabled:opacity-50"
                            style={{ background: '#DC2626' }}
                          >
                            <FileText size={13} />
                            {downloadingId === r.id ? '…' : 'Factura'}
                          </button>
                          <button
                            type="button"
                            disabled={downloadingTicketId === r.id}
                            onClick={() => void downloadPdfVariant(r.id, 'ticket')}
                            title="Ticket PDF 80mm (térmico) con datos FEL"
                            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Receipt size={13} />
                            {downloadingTicketId === r.id ? '…' : 'Ticket'}
                          </button>
                          {/* Botón Cobrar solo para crédito/pendiente */}
                          {isPending ? (
                            <button
                              type="button"
                              disabled={collectMutation.isPending}
                              onClick={() => openCollectModal(r)}
                              title="Registrar abono"
                              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <CheckCircle2 size={13} />
                              Cobrar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
