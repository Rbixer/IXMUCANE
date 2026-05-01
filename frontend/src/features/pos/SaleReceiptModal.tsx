import { useCallback, useEffect, useState } from 'react'
import { FileText, Printer, X } from 'lucide-react'
import { api } from '../../shared/api/client'
import { saleFacturaPdfUrl } from '../reportes/reportes.service'
import type { PosSale } from './pos.service'

const PAYMENT_LABELS: Record<'cash' | 'card' | 'other', string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  other: 'Otro',
}

function toAmount(s: string): number {
  const n = Number(String(s).trim())
  return Number.isFinite(n) ? n : 0
}

function formatQ(amount: number): string {
  return `Q ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function lineSubtotalGtq(unitPrice: string, quantity: number): number {
  return toAmount(unitPrice) * quantity
}

type Props = {
  sale: PosSale | null
  onClose: () => void
  /** Tras registrar venta vs consulta desde POS · Facturas. */
  variant?: 'post-sale' | 'preview'
  /** Muestra acción de impresión del navegador (vista previa tipo recibo). */
  showPrintButton?: boolean
}

export function SaleReceiptModal({
  sale,
  onClose,
  variant = 'post-sale',
  showPrintButton = false,
}: Props) {
  const [downloading, setDownloading] = useState(false)

  const handlePrint = useCallback(() => {
    document.body.classList.add('printing-pos-receipt')
    const clear = () => document.body.classList.remove('printing-pos-receipt')
    window.addEventListener('afterprint', clear, { once: true })
    setTimeout(clear, 2_000)
    window.print()
  }, [])

  useEffect(() => {
    return () => {
      document.body.classList.remove('printing-pos-receipt')
    }
  }, [])

  if (!sale) return null

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      const path = saleFacturaPdfUrl(sale.id)
      const { data } = await api.get(path, { responseType: 'blob' })
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `factura_ticket_${sale.id}.pdf`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const fecha = new Date(sale.created_at).toLocaleString('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const heading =
    variant === 'preview' ? 'Vista previa del recibo' : 'Venta registrada'

  const subtotal = sale.lines.reduce((s, l) => s + lineSubtotalGtq(l.unit_price, l.quantity), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 print:static print:inset-auto print:block print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-receipt-title"
    >
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm print:hidden" aria-label="Cerrar" onClick={onClose} />

      <div className="pos-receipt-print-root relative z-10 flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">

        {/* Barra de controles */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-5 py-3 print:hidden">
          <span id="sale-receipt-title" className="text-sm font-bold text-gray-700">{heading}</span>
          <div className="flex items-center gap-2">
            {showPrintButton ? (
              <button type="button" onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
                <Printer size={13} /> Imprimir
              </button>
            ) : null}
            <button type="button" onClick={() => void downloadPdf()} disabled={downloading}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: '#1a1a2e' }}>
              <FileText size={13} /> {downloading ? '…' : 'PDF'}
            </button>
            <button type="button" onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:bg-gray-50">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Documento */}
        <div className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="px-7 py-6">

            {/* Header empresa + número */}
            <div className="flex items-start justify-between gap-4 border-b-2 border-red-600 pb-5">
              <div className="flex items-center gap-3">
                <img src="/logo-ixmucane.png" alt="Logo" className="h-14 w-14 object-contain" />
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-gray-900">Aluminios Ixmucane</p>
                  <p className="text-[10px] text-gray-400">Ollas · Cubiertos · Porcelanas y Más</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">{sale.branch_name}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="inline-block rounded-xl px-3 py-2" style={{ background: '#DC2626' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-red-100">Ticket</p>
                  <p className="text-lg font-black text-white">#{sale.id}</p>
                </div>
                <p className="mt-1.5 text-[10px] font-semibold text-gray-500">{fecha}</p>
              </div>
            </div>

            {/* Datos cliente + pago */}
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-gray-50 px-4 py-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Cliente</p>
                <p className="text-sm font-bold text-gray-800">{sale.customer_name || 'Consumidor final'}</p>
                {sale.customer_phone ? <p className="text-[10px] text-gray-500">{sale.customer_phone}</p> : null}
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Método de pago</p>
                <p className="text-sm font-bold text-gray-800">{PAYMENT_LABELS[sale.payment_method]}</p>
              </div>
            </div>

            {/* Badge estado de pago (crédito / pendiente) */}
            {sale.payment_status && sale.payment_status !== 'paid' ? (
              <div
                className="mt-2 flex items-start gap-2.5 rounded-xl border px-4 py-2.5"
                style={
                  sale.payment_status === 'credit'
                    ? { background: '#EFF6FF', borderColor: '#BFDBFE' }
                    : { background: '#FFFBEB', borderColor: '#FDE68A' }
                }
              >
                <div className="mt-0.5 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: sale.payment_status === 'credit' ? '#1D4ED8' : '#B45309' }}>
                    {sale.payment_status === 'credit' ? 'Venta a crédito' : 'Pago pendiente'}
                    {sale.payment_status === 'credit' && sale.credit_days > 0 ? ` — ${sale.credit_days} días de plazo` : ''}
                  </p>
                  {sale.credit_note ? (
                    <p className="mt-0.5 text-[10px] text-gray-500">{sale.credit_note}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Tabla de productos */}
            <table className="mt-5 w-full border-collapse text-sm">
              <thead>
                <tr style={{ background: '#1a1a2e' }}>
                  <th className="rounded-tl-lg px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-white/70">SKU</th>
                  <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-white/70">Producto</th>
                  <th className="px-3 py-2 text-center text-[9px] font-bold uppercase tracking-wider text-white/70">Cant.</th>
                  <th className="rounded-tr-lg px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-white/70">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {sale.lines.map((line, idx) => (
                  <tr key={line.id} className="border-b border-gray-100" style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td className="px-3 py-2 font-mono text-[10px] text-gray-400">{line.sku}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-gray-800">{line.product_name}</td>
                    <td className="px-3 py-2 text-center text-xs font-bold text-gray-700">{line.quantity}</td>
                    <td className="px-3 py-2 text-right text-xs font-black tabular-nums text-gray-900">
                      {formatQ(lineSubtotalGtq(line.unit_price, line.quantity))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totales */}
            <div className="mt-3 flex justify-end">
              <div className="w-52 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="tabular-nums font-semibold text-gray-600">{formatQ(subtotal)}</span>
                </div>
                <div className="h-px bg-gray-200" />
                <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: '#DC2626' }}>
                  <span className="text-xs font-black text-white">TOTAL</span>
                  <span className="text-base font-black tabular-nums text-white">{formatQ(toAmount(sale.total))}</span>
                </div>
              </div>
            </div>

            {/* Pie */}
            <p className="mt-5 text-center text-[10px] text-gray-300">
              Aluminios Ixmucane · Gracias por su preferencia
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
