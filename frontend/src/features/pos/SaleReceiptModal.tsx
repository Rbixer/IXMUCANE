import { useCallback, useEffect, useState } from 'react'
import { Download, FileText, Printer, Receipt, ShieldCheck, Truck, X } from 'lucide-react'
import { api } from '../../shared/api/client'
import { saleFacturaPdfUrl, saleFacturaTicketPdfUrl } from '../reportes/reportes.service'
import type { PosSale } from './pos.service'
import {
  certificarVentaFel,
  descargarXmlCertificado,
  descargarXmlEnviado,
  getFelDocumentoBySale,
  type FelDocumento,
} from '../fel/fel.service'
import { notifyError, notifySuccess } from '../../shared/lib/notify'

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
  const [downloading, setDownloading] = useState<'factura' | 'ticket' | null>(null)
  const [felDoc, setFelDoc] = useState<FelDocumento | null>(null)
  const [felLoading, setFelLoading] = useState(false)
  const [felCertifying, setFelCertifying] = useState(false)
  const [felXmlDownloading, setFelXmlDownloading] = useState<'certificado' | 'enviado' | null>(null)

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

  useEffect(() => {
    if (!sale) return
    let cancelled = false
    setFelLoading(true)
    getFelDocumentoBySale(sale.id)
      .then((doc) => {
        if (!cancelled) setFelDoc(doc)
      })
      .catch(() => {
        if (!cancelled) setFelDoc(null)
      })
      .finally(() => {
        if (!cancelled) setFelLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sale?.id])

  const handleDownloadFelXml = async (kind: 'certificado' | 'enviado') => {
    if (!sale) return
    setFelXmlDownloading(kind)
    try {
      if (kind === 'certificado') await descargarXmlCertificado(sale.id)
      else await descargarXmlEnviado(sale.id)
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'No se pudo descargar el XML.')
    } finally {
      setFelXmlDownloading(null)
    }
  }

  const handleCertificar = async () => {
    if (!sale) return
    setFelCertifying(true)
    try {
      const doc = await certificarVentaFel(sale.id)
      setFelDoc(doc)
      if (doc.estado === 'certificado') {
        notifySuccess(`Factura certificada (Serie ${doc.serie} · No. ${doc.numero_autorizacion}).`)
      } else if (doc.estado === 'rechazado') {
        notifyError(`SAT/Corpo rechazó el documento: ${doc.error_mensaje || 'sin detalle'}`)
      } else {
        notifyError(doc.error_mensaje || 'No se pudo certificar la factura. Reintente.')
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Error al certificar la factura.')
    } finally {
      setFelCertifying(false)
    }
  }

  if (!sale) return null

  const downloadPdfVariant = async (variant: 'factura' | 'ticket') => {
    setDownloading(variant)
    try {
      const path = variant === 'ticket'
        ? saleFacturaTicketPdfUrl(sale.id)
        : saleFacturaPdfUrl(sale.id)
      const { data } = await api.get(path, { responseType: 'blob' })
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = variant === 'ticket'
        ? `ticket_${sale.id}.pdf`
        : `factura_${sale.id}.pdf`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'No se pudo descargar el PDF.')
    } finally {
      setDownloading(null)
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
            <button
              type="button"
              onClick={() => void downloadPdfVariant('factura')}
              disabled={downloading !== null}
              title="Factura tamaño carta con datos FEL"
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: '#1a1a2e' }}
            >
              <FileText size={13} /> {downloading === 'factura' ? '…' : 'Factura PDF'}
            </button>
            <button
              type="button"
              onClick={() => void downloadPdfVariant('ticket')}
              disabled={downloading !== null}
              title="Ticket de 80mm para impresora térmica"
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              <Receipt size={13} /> {downloading === 'ticket' ? '…' : 'Ticket PDF'}
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

            {/* Envío */}
            {sale.is_envio ? (
              <div
                className="mt-3 flex items-start gap-3 rounded-xl border px-4 py-3 print:hidden"
                style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}
              >
                <Truck size={18} style={{ color: '#92400E' }} />
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#92400E' }}>
                    Procesada como envío
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    Esta venta se registró como envío. Genera recibo / ticket.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Estado FEL */}
            {!sale.is_envio ? (
            <div
              className="mt-3 flex items-start gap-3 rounded-xl border px-4 py-3 print:hidden"
              style={
                felDoc?.estado === 'certificado'
                  ? { background: '#F0FDF4', borderColor: '#BBF7D0' }
                  : felDoc?.estado === 'rechazado' || felDoc?.estado === 'error'
                    ? { background: '#FEF2F2', borderColor: '#FECACA' }
                    : { background: '#F8FAFC', borderColor: '#E2E8F0' }
              }
            >
              <ShieldCheck
                size={18}
                style={{
                  color:
                    felDoc?.estado === 'certificado'
                      ? '#15803D'
                      : felDoc?.estado === 'rechazado' || felDoc?.estado === 'error'
                        ? '#B91C1C'
                        : '#475569',
                }}
              />
              <div className="flex-1">
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color:
                      felDoc?.estado === 'certificado'
                        ? '#15803D'
                        : felDoc?.estado === 'rechazado' || felDoc?.estado === 'error'
                          ? '#B91C1C'
                          : '#475569',
                  }}
                >
                  Factura electrónica (FEL · {felDoc?.ambiente ?? 'pruebas'})
                </p>
                {felLoading ? (
                  <p className="mt-0.5 text-[11px] text-gray-500">Consultando estado…</p>
                ) : felDoc?.estado === 'certificado' ? (
                  <div className="mt-0.5 text-[11px] text-gray-700">
                    <p>
                      <span className="font-semibold">Serie:</span> {felDoc.serie || '—'}{' '}
                      <span className="ml-2 font-semibold">No. autorización:</span>{' '}
                      <span className="font-mono">{felDoc.numero_autorizacion || '—'}</span>
                    </p>
                    {felDoc.fecha_certificacion ? (
                      <p className="text-gray-500">
                        Certificada el{' '}
                        {new Date(felDoc.fecha_certificacion).toLocaleString('es-GT', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : felDoc ? (
                  <p className="mt-0.5 text-[11px] text-gray-600">
                    {felDoc.estado === 'rechazado' || felDoc.estado === 'error'
                      ? felDoc.error_mensaje || 'No se certificó. Reintente.'
                      : 'Pendiente de certificación.'}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Aún no se ha enviado a certificar.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {felDoc?.estado !== 'certificado' ? (
                  <button
                    type="button"
                    onClick={() => void handleCertificar()}
                    disabled={felCertifying || felLoading}
                    className="rounded-xl px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    style={{ background: '#15803D' }}
                  >
                    {felCertifying ? 'Enviando…' : 'Certificar FEL'}
                  </button>
                ) : null}
                {felDoc?.estado === 'certificado' ? (
                  <button
                    type="button"
                    onClick={() => void handleDownloadFelXml('certificado')}
                    disabled={felXmlDownloading !== null}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <Download size={12} />
                    {felXmlDownloading === 'certificado' ? 'Descargando…' : 'XML SAT'}
                  </button>
                ) : null}
                {felDoc && (felDoc.estado === 'rechazado' || felDoc.estado === 'error') ? (
                  <button
                    type="button"
                    onClick={() => void handleDownloadFelXml('enviado')}
                    disabled={felXmlDownloading !== null}
                    className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    title="Descargar el XML enviado a Corpo (depuración)"
                  >
                    <Download size={12} />
                    {felXmlDownloading === 'enviado' ? 'Descargando…' : 'XML enviado'}
                  </button>
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
