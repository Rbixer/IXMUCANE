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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 print:static print:inset-auto print:block print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-receipt-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 print:hidden"
        aria-label="Cerrar vista previa"
        onClick={onClose}
      />
      <div className="pos-receipt-print-root relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-soft print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 print:hidden">
          <h2 id="sale-receipt-title" className="text-base font-semibold text-slate-900">
            {heading}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 print:hidden"
            aria-label="Cerrar"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="receipt-ticket-body border-b border-dashed border-slate-300 bg-slate-50 px-5 py-6 font-mono text-sm text-slate-800 print:border-slate-400 print:bg-white">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500">Recibo</p>
          <p className="mt-2 text-center text-lg font-bold text-slate-900">Ticket #{sale.id}</p>
          <p className="mt-0.5 text-center text-xs text-slate-500">{fecha}</p>
          <p className="mt-2 text-center text-xs">
            <span className="text-slate-500">Pago:</span>{' '}
            <span className="font-semibold">{PAYMENT_LABELS[sale.payment_method]}</span>
          </p>
          {sale.customer_name ? (
            <div className="mt-2 space-y-0.5 text-center text-[11px] text-slate-600">
              <p>
                <span className="text-slate-500">Cliente:</span>{' '}
                <span className="font-semibold text-slate-800">{sale.customer_name}</span>
              </p>
              {sale.customer_phone ? <p>Tel: {sale.customer_phone}</p> : null}
              {sale.customer_email ? <p>{sale.customer_email}</p> : null}
              {sale.customer_address ? <p>{sale.customer_address}</p> : null}
            </div>
          ) : null}
          <div className="my-4 border-t border-dashed border-slate-300" />
          <ul className="space-y-3">
            {sale.lines.map((line) => {
              const lineGtq = lineSubtotalGtq(line.unit_price, line.quantity)
              return (
                <li key={line.id} className="flex gap-3 text-xs leading-relaxed">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-semibold text-slate-800">{line.sku}</p>
                    <p className="mt-0.5 text-slate-900">{line.product_name}</p>
                  </div>
                  <div className="shrink-0 self-start text-right font-semibold tabular-nums text-slate-900">
                    {formatQ(lineGtq)}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="my-4 border-t border-dashed border-slate-300" />
          <div className="flex items-center justify-between text-base font-bold text-slate-900">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatQ(toAmount(sale.total))}</span>
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-500">Gracias por su compra</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 print:hidden">
          {showPrintButton ? (
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Printer size={16} aria-hidden />
              Imprimir
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <FileText size={16} aria-hidden />
            {downloading ? 'Descargando…' : 'Factura PDF'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#c40000] px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
