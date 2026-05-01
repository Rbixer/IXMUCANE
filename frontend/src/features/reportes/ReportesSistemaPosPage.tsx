import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { downloadReportFile, fetchReportPosJson } from './reportes.service'
import { DataTable } from '../../shared/ui/DataTable'
import type { PosReportSale } from './reportes.service'

export function ReportesSistemaPosPage() {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['reports', 'sistema-pos', 'all'],
    queryFn: () => fetchReportPosJson(),
  })

  const rows: PosReportSale[] = q.data?.ventas ?? []

  const doDownload = async (format: 'pdf' | 'xlsx') => {
    setBusy(format)
    setDownloadError(null)
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      await downloadReportFile(
        '/reports/sistema-pos/',
        format,
        `reporte_pos_${stamp}.${format === 'pdf' ? 'pdf' : 'xlsx'}`,
      )
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'No se pudo generar el archivo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-material-outline pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Reportes · Sistema POS</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Tickets de venta y totales. Exporte a PDF (resumen) o Excel (ventas y detalle de líneas).
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          disabled={busy === 'pdf'}
          onClick={() => void doDownload('pdf')}
          className="inline-flex items-center gap-2 rounded-lg bg-boutique-500 px-4 py-2 text-sm font-semibold text-white hover:bg-boutique-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileText size={18} aria-hidden />
          {busy === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}
        </button>
        <button
          type="button"
          disabled={busy === 'xlsx'}
          onClick={() => void doDownload('xlsx')}
          className="inline-flex items-center gap-2 rounded-lg border border-material-outline bg-white px-4 py-2 text-sm font-semibold text-material-emphasis hover:bg-material-surface-variant disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileSpreadsheet size={18} aria-hidden />
          {busy === 'xlsx' ? 'Generando Excel…' : 'Descargar Excel'}
        </button>
      </div>

      {q.error ? (
        <p className="text-sm text-red-600">{(q.error as Error).message}</p>
      ) : null}
      {downloadError ? <p className="text-sm text-red-600">{downloadError}</p> : null}

      <div className="rounded-xl border border-material-outline bg-material-surface p-4 shadow-material">
        <h2 className="mb-3 text-sm font-semibold text-material-emphasis">Vista previa (últimos tickets)</h2>
        <DataTable<PosReportSale>
          columns={[
            { key: 'id', label: 'Ticket' },
            { key: 'fecha', label: 'Fecha', render: (r) => r.fecha.slice(0, 19).replace('T', ' ') },
            { key: 'metodo_pago', label: 'Pago' },
            { key: 'total', label: 'Total' },
            {
              key: 'lineas',
              label: 'Líneas',
              render: (r) => String(r.lineas?.length ?? 0),
            },
          ]}
          rows={rows}
          emptyMessage={q.isLoading ? 'Cargando…' : 'Sin ventas registradas.'}
        />
      </div>
    </div>
  )
}
