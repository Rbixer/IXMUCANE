import axios from 'axios'
import { api } from '../../shared/api/client'

export type InventoryReportItem = {
  id: number
  nombre: string
  branch_id: number
  branch_name: string
  categoria: string
  units_per_package: number
  units_per_fardo: number
  cantidad: number
  precio_unitario: string
  precio_costo: string
}

export type InventoryReportJson = {
  generated_at: string
  items: InventoryReportItem[]
}

export async function transferInventoryByBranch(fromBranchId: number, toBranchId: number) {
  const { data } = await api.post('/inventory/transfer-by-branch/', {
    from_branch_id: fromBranchId,
    to_branch_id: toBranchId,
  })
  return data as { moved: number; from_branch_id: number; to_branch_id: number }
}

export type PosReportLine = {
  sku: string
  producto: string
  cantidad: number
  units_per_package: number
  packages_per_fardo: number
  venta_fardos: number
  venta_paquetes: number
  venta_unidades_resto: number
  jerarquia_txt: string
  precio_unitario: string
  subtotal: string
}

export type PosReportSale = {
  id: number
  ubicacion: string
  metodo_pago: string
  total: string
  fecha: string
  lineas: PosReportLine[]
}

export type PosReportJson = {
  generated_at: string
  ventas: PosReportSale[]
}

type ReportSlug = 'inventario' | 'sistema-pos'
type ReportKind = 'json' | 'pdf' | 'xlsx'
type InventoryScope = 'tienda' | 'b1' | 'b2' | 'b3'

/**
 * Exportación por ruta explícita (`/reports/inventario/pdf/`, etc.).
 * Evita ambigüedades de query y negociación de contenido del cliente HTTP.
 */
function reportExportPath(slug: ReportSlug, kind: ReportKind, branchId?: number, scope?: InventoryScope): string {
  const s = new URLSearchParams()
  if (branchId != null && branchId > 0) s.set('branch', String(branchId))
  if (scope) s.set('scope', scope)
  s.set('_t', String(Date.now()))
  const q = s.toString()
  return `/reports/${slug}/${kind}/${q ? `?${q}` : ''}`
}

function reportAcceptHeader(kind: ReportKind): string {
  if (kind === 'json') return 'application/json'
  /*
   * DRF negocia renderers ANTES de ejecutar la vista. Solo `application/pdf` (o solo Excel)
   * no coincide con JSON/BrowsableAPI → 406 Not Acceptable y la vista nunca corre.
   * El PDF/Excel se devuelve como HttpResponse crudo; basta con aceptar JSON en negociación.
   */
  return 'application/json, */*;q=0.1'
}

function reportRequestHeaders(kind: ReportKind): Record<string, string> {
  return {
    Accept: reportAcceptHeader(kind),
    'X-Boutique-Report': kind,
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  }
}

function decodeApiErrorFromBuffer(buf: ArrayBuffer): string | null {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, 800)).trim()
  if (!text.startsWith('{')) return null
  try {
    const j = JSON.parse(text) as { detail?: unknown }
    const d = j.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d.length) {
      const first = d[0]
      if (typeof first === 'string') return first
      if (first && typeof first === 'object' && 'detail' in first && typeof (first as { detail: string }).detail === 'string') {
        return (first as { detail: string }).detail
      }
    }
    return text.slice(0, 240)
  } catch {
    return text.slice(0, 240)
  }
}

export async function fetchReportInventoryJson(branchId?: number): Promise<InventoryReportJson> {
  const { data } = await api.get<InventoryReportJson>(reportExportPath('inventario', 'json', branchId), {
    headers: reportRequestHeaders('json'),
  })
  return data
}

export async function fetchReportPosJson(branchId?: number): Promise<PosReportJson> {
  const { data } = await api.get<PosReportJson>(reportExportPath('sistema-pos', 'json', branchId), {
    headers: reportRequestHeaders('json'),
  })
  return data
}

export async function downloadReportFile(
  path: '/reports/inventario/' | '/reports/sistema-pos/',
  format: 'pdf' | 'xlsx',
  filename: string,
  branchId?: number,
  scope?: InventoryScope,
) {
  const mime =
    format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  const slug: ReportSlug = path.includes('sistema-pos') ? 'sistema-pos' : 'inventario'
  const url = reportExportPath(slug, format, branchId, scope)

  let response: Awaited<ReturnType<typeof api.get<ArrayBuffer>>>
  try {
    response = await api.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      headers: reportRequestHeaders(format),
      transformResponse: [(data) => data],
    })
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data instanceof ArrayBuffer) {
      const msg = decodeApiErrorFromBuffer(err.response.data)
      if (msg) throw new Error(msg)
    }
    throw err
  }

  const buf = response.data
  if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0) {
    throw new Error('El servidor devolvió un archivo vacío o inválido.')
  }

  const ct = (response.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (format === 'pdf' && ct && ct !== 'application/pdf') {
    const msg = decodeApiErrorFromBuffer(buf)
    if (msg) throw new Error(msg)
  }
  if (format === 'xlsx' && ct && !ct.includes('spreadsheet') && !ct.includes('zip')) {
    const msg = decodeApiErrorFromBuffer(buf)
    if (msg) throw new Error(msg)
  }

  const head = new Uint8Array(buf.slice(0, Math.min(8, buf.byteLength)))
  const ascii4 = String.fromCharCode(head[0] ?? 0, head[1] ?? 0, head[2] ?? 0, head[3] ?? 0)

  if (format === 'pdf' && !ascii4.startsWith('%PDF')) {
    const hint = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, Math.min(400, buf.byteLength)))
    const fromJson = decodeApiErrorFromBuffer(buf)
    throw new Error(
      fromJson ??
        (hint.trim().startsWith('{')
          ? `El servidor respondió JSON en lugar de PDF: ${hint.slice(0, 180)}`
          : 'El archivo descargado no es un PDF válido (cabecera %PDF ausente). Reinicie el servidor Django tras actualizar rutas.'),
    )
  }
  if (format === 'xlsx' && (head[0] !== 0x50 || head[1] !== 0x4b)) {
    const hint = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, Math.min(400, buf.byteLength)))
    const fromJson = decodeApiErrorFromBuffer(buf)
    throw new Error(
      fromJson ??
        (hint.trim().startsWith('{')
          ? `El servidor respondió JSON en lugar de Excel: ${hint.slice(0, 180)}`
          : 'El archivo descargado no es un Excel válido (cabecera ZIP ausente).'),
    )
  }

  const blob = new Blob([buf], { type: mime })
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  queueMicrotask(() => URL.revokeObjectURL(objectUrl))
}

export function saleFacturaPdfUrl(saleId: number): string {
  return `/pos/sales/${saleId}/factura-pdf/`
}
