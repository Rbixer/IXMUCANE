import { api } from '../../shared/api/client'

export type FelEstado = 'pendiente' | 'certificado' | 'rechazado' | 'error'
export type FelAmbiente = 'pruebas' | 'produccion'

export type FelDocumento = {
  id: number
  sale_id: number
  emisor: number
  emisor_nombre: string
  estado: FelEstado
  ambiente: FelAmbiente
  serie: string
  numero_autorizacion: string
  fecha_certificacion: string | null
  error_mensaje: string
  intentos: number
  created_at: string
  updated_at: string
}

export async function getFelDocumentoBySale(saleId: number): Promise<FelDocumento | null> {
  const { data } = await api.get<{ results?: FelDocumento[] } | FelDocumento[]>(
    '/fel/documentos/',
    { params: { sale: saleId } },
  )
  const list = Array.isArray(data) ? data : (data?.results ?? [])
  return list[0] ?? null
}

export async function certificarVentaFel(saleId: number): Promise<FelDocumento> {
  const { data } = await api.post<FelDocumento>(`/fel/documentos/certificar/${saleId}/`)
  return data
}

async function downloadFelXml(saleId: number, kind: 'certificado' | 'enviado'): Promise<void> {
  const path = kind === 'certificado'
    ? `/fel/documentos/xml-certificado/${saleId}/`
    : `/fel/documentos/xml-enviado/${saleId}/`
  const { data } = await api.get(path, { responseType: 'blob' })
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = kind === 'certificado'
    ? `fel_certificado_venta_${saleId}.xml`
    : `fel_enviado_venta_${saleId}.xml`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function descargarXmlCertificado(saleId: number): Promise<void> {
  return downloadFelXml(saleId, 'certificado')
}

export function descargarXmlEnviado(saleId: number): Promise<void> {
  return downloadFelXml(saleId, 'enviado')
}

export async function descargarFelXmlsZip(params: { from?: string; to?: string }): Promise<void> {
  const search: Record<string, string> = {}
  if (params.from) search.from = params.from
  if (params.to) search.to = params.to
  try {
    const { data } = await api.get('/fel/documentos/xmls-zip/', {
      params: search,
      responseType: 'blob',
    })
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const range = [params.from, params.to].filter(Boolean).join('_')
    a.download = range ? `fel_certificados_${range}.zip` : 'fel_certificados.zip'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    // Si el backend respondió 404 con JSON pero llegó como blob, lo decodificamos.
    const anyErr = err as { response?: { data?: unknown; status?: number } }
    const data = anyErr?.response?.data
    if (data instanceof Blob) {
      try {
        const text = await data.text()
        const parsed = JSON.parse(text) as { detail?: string }
        if (parsed?.detail) throw new Error(parsed.detail)
      } catch (innerErr) {
        if (innerErr instanceof Error && innerErr.message) throw innerErr
      }
    }
    throw err
  }
}
