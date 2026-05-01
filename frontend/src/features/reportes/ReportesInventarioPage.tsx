import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText } from 'lucide-react'
import {
  downloadReportFile,
  fetchReportInventoryJson,
  type InventoryReportItem,
} from './reportes.service'
import { listBranches } from '../branches/branches.service'
import { DataTable } from '../../shared/ui/DataTable'

function bodegaSlotFromName(name: string): 1 | 2 | 3 | null {
  const m = name.trim().toLowerCase().match(/^bodega\s*([123])$/)
  if (!m) return null
  const n = Number(m[1])
  return n === 1 || n === 2 || n === 3 ? n : null
}

export function ReportesInventarioPage() {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [ubicacionFiltro, setUbicacionFiltro] = useState<'all' | 'tienda' | 'b1' | 'b2' | 'b3'>('all')

  const q = useQuery({
    queryKey: ['reports', 'inventario', 'all'],
    queryFn: () => fetchReportInventoryJson(),
  })
  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: listBranches,
    staleTime: 60_000,
  })

  const rows = q.data?.items ?? []
  const bodegaBranchBySlot = useMemo(() => {
    const bySlot = new Map<1 | 2 | 3, number>()
    for (const b of branchesQuery.data ?? []) {
      if (b.id <= 0) continue
      const slot = bodegaSlotFromName(b.name)
      if (slot != null) bySlot.set(slot, b.id)
    }
    return {
      b1: bySlot.get(1) ?? null,
      b2: bySlot.get(2) ?? null,
      b3: bySlot.get(3) ?? null,
    }
  }, [branchesQuery.data])
  const bodegaBranchIds = useMemo(
    () => new Set([bodegaBranchBySlot.b1, bodegaBranchBySlot.b2, bodegaBranchBySlot.b3].filter(Boolean)),
    [bodegaBranchBySlot],
  )
  const tiendaBranchId = useMemo(() => {
    const all = branchesQuery.data ?? []
    return all.find((b) => b.id > 0 && !bodegaBranchIds.has(b.id))?.id ?? null
  }, [branchesQuery.data, bodegaBranchIds])
  const filteredRows = useMemo(() => {
    if (ubicacionFiltro === 'all') return rows
    if (ubicacionFiltro === 'tienda') return rows.filter((item) => !bodegaBranchIds.has(item.branch_id))
    const target = bodegaBranchBySlot[ubicacionFiltro]
    if (!target) return []
    return rows.filter((item) => item.branch_id === target)
  }, [rows, ubicacionFiltro, bodegaBranchBySlot, bodegaBranchIds])
  const doDownload = async (format: 'pdf' | 'xlsx') => {
    setBusy(format)
    setDownloadError(null)
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const ext = format === 'pdf' ? 'pdf' : 'xlsx'
      const loc =
        ubicacionFiltro === 'all'
          ? 'todos'
          : ubicacionFiltro === 'tienda'
            ? 'tienda'
            : ubicacionFiltro
      await downloadReportFile(
        '/reports/inventario/',
        format,
        `inventario_${loc}_${stamp}.${ext}`,
        undefined,
        ubicacionFiltro === 'all' ? undefined : ubicacionFiltro,
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
        <h1 className="text-2xl font-medium tracking-tight text-material-emphasis">Reportes · Inventario consolidado</h1>
        <p className="mt-1 max-w-2xl text-sm text-material-muted">
          Vista previa del catálogo y existencias (misma fuente que{' '}
          <Link to="/inventario/productos" className="font-semibold text-boutique-600 underline underline-offset-2 hover:text-boutique-700">
            Inventario · Productos
          </Link>
          ). Descargue el reporte en PDF o en Excel; cada botón solo se deshabilita mientras genera su archivo.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-material-emphasis">
          Ubicación:
          <select
            value={ubicacionFiltro}
            onChange={(event) => setUbicacionFiltro(event.target.value as 'all' | 'tienda' | 'b1' | 'b2' | 'b3')}
            className="rounded-lg border border-material-outline bg-white px-3 py-2 text-sm font-medium text-material-emphasis"
          >
            <option value="all">Todos</option>
            <option value="tienda">Principal (mostrador)</option>
            <option value="b1">Bodega 1</option>
            <option value="b2">Bodega 2</option>
            <option value="b3">Bodega 3</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy === 'pdf'}
          onClick={() => void doDownload('pdf')}
          className="inline-flex items-center gap-2 rounded-lg bg-boutique-500 px-4 py-2 text-sm font-semibold text-white hover:bg-boutique-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileText size={18} aria-hidden />
          {busy === 'pdf' ? 'Generando PDF…' : 'Descargar inventario consolidado (.pdf)'}
        </button>
        <button
          type="button"
          disabled={busy === 'xlsx'}
          onClick={() => void doDownload('xlsx')}
          className="inline-flex items-center gap-2 rounded-lg border border-material-outline bg-white px-4 py-2 text-sm font-semibold text-material-emphasis hover:bg-material-surface-variant disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileSpreadsheet size={18} aria-hidden />
          {busy === 'xlsx' ? 'Generando Excel…' : 'Descargar inventario consolidado (.xlsx)'}
        </button>
      </div>

      {q.error ? (
        <p className="text-sm text-red-600">{(q.error as Error).message}</p>
      ) : null}
      {downloadError ? <p className="text-sm text-red-600">{downloadError}</p> : null}
      {ubicacionFiltro !== 'all' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">
            {ubicacionFiltro === 'tienda'
              ? `Principal (mostrador): ${filteredRows.length} producto(s).`
              : `${ubicacionFiltro === 'b1' ? 'Bodega 1' : ubicacionFiltro === 'b2' ? 'Bodega 2' : 'Bodega 3'}: ${filteredRows.length} producto(s).`}
          </p>
        </div>
      ) : null}

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
            {
              key: 'disponible',
              label: 'Disponible',
              render: (item) =>
                item.cantidad > 0 ? (
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    Disponible
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                    No disponible
                  </span>
                ),
            },
          ]}
          rows={filteredRows}
          emptyMessage={q.isLoading ? 'Cargando…' : 'Sin registros.'}
        />
      </div>
    </div>
  )
}
