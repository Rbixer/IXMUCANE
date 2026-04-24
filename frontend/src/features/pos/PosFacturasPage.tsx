import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { listPosSales } from './pos.service'
import { api } from '../../shared/api/client'
import { saleFacturaPdfUrl } from '../reportes/reportes.service'
import { DataTable } from '../../shared/ui/DataTable'
import type { PosSaleListItem } from './pos.service'

export function PosFacturasPage() {
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

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

  const rows = salesQuery.data ?? []

  return (
    <div className="space-y-6">
      <header className="border-b border-material-outline pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">POS · Facturas</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Cada venta POS queda como ticket (número de factura) con detalle descargable en PDF. Las existencias reflejan
          el inventario y coinciden con Inventario · Productos y Reportes · Inventario general.
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
            { key: 'lines_count', label: 'Productos' },
            { key: 'total_units', label: 'Unidades' },
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
