import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, FileText } from 'lucide-react'
import { fetchPosSale, listPosSales, posSaleFromListItem } from './pos.service'
import { SaleReceiptModal } from './SaleReceiptModal'
import { api } from '../../shared/api/client'
import { saleFacturaPdfUrl } from '../reportes/reportes.service'
import { notifyError } from '../../shared/lib/notify'
import { DataTable } from '../../shared/ui/DataTable'
import type { PosSale, PosSaleListItem } from './pos.service'

export function PosFacturasPage() {
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [previewSale, setPreviewSale] = useState<PosSale | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null)

  const salesQuery = useQuery({
    queryKey: ['pos', 'sales', 'facturas', 'all'],
    queryFn: () => listPosSales(),
  })

  const downloadPdf = async (saleId: number) => {
    setDownloadingId(saleId)
    try {
      const path = saleFacturaPdfUrl(saleId)
      const { data } = await api.get(path, { responseType: 'blob' })
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `factura_ticket_${saleId}.pdf`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingId(null)
    }
  }

  const openReceiptPreview = async (row: PosSaleListItem) => {
    const fromList = posSaleFromListItem(row)
    if (fromList) {
      setPreviewSale(fromList)
      return
    }
    setPreviewLoadingId(row.id)
    try {
      const sale = await fetchPosSale(row.id)
      setPreviewSale(sale)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'No se pudo cargar el detalle de la venta.')
    } finally {
      setPreviewLoadingId(null)
    }
  }

  const rows = salesQuery.data ?? []

  return (
    <div className="space-y-6">
      <SaleReceiptModal
        sale={previewSale}
        onClose={() => setPreviewSale(null)}
        variant="preview"
        showPrintButton
      />
      <header className="border-b border-material-outline pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">POS · Facturas</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Use la columna Vista previa para ver el recibo en
          pantalla antes de imprimir o descargar el PDF. Cada venta POS queda como ticket; las existencias reflejan el
          inventario y coinciden con la sección Inventario · Productos y reportes.
        </p>
      </header>

      {salesQuery.error ? (
        <p className="text-sm text-red-600">{(salesQuery.error as Error).message}</p>
      ) : null}
      <div className="rounded-xl border border-material-outline bg-material-surface p-4 shadow-material">
        <DataTable<PosSaleListItem>
          columns={[
            { key: 'id', label: 'Ticket' },
            {
              key: 'created_at',
              label: 'Fecha',
              render: (r) => new Date(r.created_at).toLocaleString('es-GT'),
            },
            {
              key: 'payment_method',
              label: 'Pago',
              render: (r) =>
                r.payment_method === 'cash' ? 'Efectivo' : r.payment_method === 'card' ? 'Tarjeta' : 'Otro',
            },
            { key: 'total', label: 'Total' },
            {
              key: 'customer_name',
              label: 'Cliente',
              render: (r) =>
                r.customer_name ? (
                  <div className="text-xs">
                    <p className="font-medium text-material-emphasis">{r.customer_name}</p>
                    <p className="text-material-muted">{r.customer_phone || r.customer_email || 'Sin contacto'}</p>
                  </div>
                ) : (
                  '—'
                ),
            },
            { key: 'lines_count', label: 'Productos' },
            { key: 'total_units', label: 'Unidades' },
            {
              key: 'preview',
              label: 'Vista previa',
              render: (r) => (
                <button
                  type="button"
                  disabled={previewLoadingId === r.id}
                  onClick={() => void openReceiptPreview(r)}
                  className="inline-flex items-center gap-1 rounded-md border border-material-outline bg-white px-2 py-1 text-xs font-semibold text-material-emphasis hover:bg-material-surface-variant disabled:opacity-50"
                >
                  <Eye size={14} aria-hidden />
                  {previewLoadingId === r.id ? '…' : 'Recibo'}
                </button>
              ),
            },
            {
              key: 'pdf',
              label: 'Factura PDF',
              render: (r) => (
                <button
                  type="button"
                  disabled={downloadingId === r.id}
                  onClick={() => void downloadPdf(r.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-material-outline bg-white px-2 py-1 text-xs font-semibold text-boutique-600 hover:bg-boutique-50 disabled:opacity-50"
                >
                  <FileText size={14} aria-hidden />
                  {downloadingId === r.id ? '…' : 'PDF'}
                </button>
              ),
            },
          ]}
          rows={rows}
          emptyMessage={salesQuery.isLoading ? 'Cargando…' : 'No hay ventas para mostrar.'}
        />
      </div>
    </div>
  )
}
