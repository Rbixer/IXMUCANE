import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { downloadReportFile, fetchReportInventoryJson, type InventoryReportItem } from './reportes.service'
import { DataTable } from '../../shared/ui/DataTable'

export function ReportesInventarioPage() {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['reports', 'inventario', 'all'],
    queryFn: () => fetchReportInventoryJson(),
  })

  const rows = q.data?.items ?? []

  const doDownload = async (format: 'pdf' | 'xlsx') => {
    setBusy(format)
    setDownloadError(null)
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const ext = format === 'pdf' ? 'pdf' : 'xlsx'
      await downloadReportFile(
        '/reports/inventario/',
        format,
        `inventario_general_${stamp}.${ext}`,
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
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Reportes · Inventario general</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Vista previa del catálogo y existencias (misma fuente que{' '}
          <Link to="/inventario/productos" className="font-semibold text-boutique-600 underline underline-offset-2 hover:text-boutique-700">
            Inventario · Productos
          </Link>
          ). Descargue el inventario general en PDF o en Excel; cada botón solo se deshabilita mientras genera su
          archivo.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <button
          type="button"
          disabled={busy === 'pdf'}
          onClick={() => void doDownload('pdf')}
          className="inline-flex items-center gap-2 rounded-lg bg-boutique-500 px-4 py-2 text-sm font-semibold text-white hover:bg-boutique-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileText size={18} aria-hidden />
          {busy === 'pdf' ? 'Generando PDF…' : 'Descargar inventario general (.pdf)'}
        </button>
        <button
          type="button"
          disabled={busy === 'xlsx'}
          onClick={() => void doDownload('xlsx')}
          className="inline-flex items-center gap-2 rounded-lg border border-material-outline bg-white px-4 py-2 text-sm font-semibold text-material-emphasis hover:bg-material-surface-variant disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileSpreadsheet size={18} aria-hidden />
          {busy === 'xlsx' ? 'Generando Excel…' : 'Descargar inventario general (.xlsx)'}
        </button>
      </div>

      {q.error ? (
        <p className="text-sm text-red-600">{(q.error as Error).message}</p>
      ) : null}
      {downloadError ? <p className="text-sm text-red-600">{downloadError}</p> : null}

      <div className="rounded-xl border border-material-outline bg-material-surface p-4 shadow-material">
        <h2 className="mb-3 text-sm font-semibold text-material-emphasis">Vista previa</h2>
        <DataTable<InventoryReportItem>
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'categoria', label: 'Categoría' },
            { key: 'units_per_package', label: 'U/paquete' },
            { key: 'units_per_fardo', label: 'U/fardo' },
            { key: 'cantidad', label: 'Unidades' },
            { key: 'precio_costo', label: 'Precio costo' },
            { key: 'precio_unitario', label: 'Precio venta' },
          ]}
          rows={rows}
          emptyMessage={q.isLoading ? 'Cargando…' : 'Sin registros.'}
        />
      </div>
    </div>
  )
}
