import { api } from '../../shared/api/client'
import {
  parseInventoryBranchSummary,
  parseInventoryItem,
  parseInventoryList,
} from '../../shared/api/schemas'
import type { InventoryItem } from '../../shared/types/domain'

export type ListInventoryParams = {
  line?: string
  branch?: number | string
  /** Filtrar por categoría de catálogo (FK). */
  category?: number | string
}

export async function listInventory(params?: ListInventoryParams) {
  const { data } = await api.get('/inventory/', { params })
  return parseInventoryList(data) as InventoryItem[]
}

export type BranchInventoryCounts = {
  total: number
  'ropa-dama': number
  'ropa-caballero': number
  stock_movimientos: number
}

export async function getInventoryBranchSummary() {
  const { data } = await api.get('/inventory/summary-by-branch/')
  return parseInventoryBranchSummary(data) as Record<string, BranchInventoryCounts>
}

export type CreateInventoryPayload = Omit<
  InventoryItem,
  'id' | 'created_at' | 'image_url' | 'category_name' | 'hierarchy'
>

function appendInventoryFormFields(fd: FormData, payload: CreateInventoryPayload) {
  fd.append('name', payload.name.trim())
  fd.append('sku', payload.sku.trim())
  fd.append('quantity', String(payload.quantity))
  fd.append('units_per_package', String(Math.max(1, Math.floor(payload.units_per_package) || 1)))
  fd.append('packages_per_fardo', String(Math.max(1, Math.floor(payload.packages_per_fardo) || 1)))
  fd.append('unit_price', String(payload.unit_price))
  fd.append('package_price', String(payload.package_price ?? '0'))
  fd.append('fardo_price', String(payload.fardo_price ?? '0'))
  fd.append('cost_price', String(payload.cost_price ?? '0'))
  fd.append('branch', String(payload.branch))
  fd.append('line', payload.line)
  fd.append('display_order', String(Math.max(0, Math.floor(Number(payload.display_order)) || 0)))
  if (payload.category != null && payload.category > 0) {
    fd.append('category', String(payload.category))
  } else {
    fd.append('category', '')
  }
}

export async function createInventoryItem(
  payload: CreateInventoryPayload,
  imageFile?: File | null,
) {
  if (imageFile) {
    const fd = new FormData()
    appendInventoryFormFields(fd, payload)
    fd.append('image', imageFile)
    const { data } = await api.post('/inventory/', fd)
    return parseInventoryItem(data) as InventoryItem
  }
  const { data } = await api.post('/inventory/', {
    ...payload,
    units_per_package: Math.max(1, Math.floor(payload.units_per_package) || 1),
    packages_per_fardo: Math.max(1, Math.floor(payload.packages_per_fardo) || 1),
    package_price: payload.package_price ?? '0',
    fardo_price: payload.fardo_price ?? '0',
    cost_price: payload.cost_price ?? '0',
    category: payload.category != null && payload.category > 0 ? payload.category : null,
  })
  return parseInventoryItem(data) as InventoryItem
}

export async function updateInventoryItem(
  itemId: number,
  payload: CreateInventoryPayload,
  imageFile?: File | null,
) {
  if (imageFile) {
    const fd = new FormData()
    appendInventoryFormFields(fd, payload)
    fd.append('image', imageFile)
    const { data } = await api.patch(`/inventory/${itemId}/`, fd)
    return parseInventoryItem(data) as InventoryItem
  }
  const { data } = await api.patch(`/inventory/${itemId}/`, {
    ...payload,
    units_per_package: Math.max(1, Math.floor(payload.units_per_package) || 1),
    packages_per_fardo: Math.max(1, Math.floor(payload.packages_per_fardo) || 1),
    package_price: payload.package_price ?? '0',
    fardo_price: payload.fardo_price ?? '0',
    cost_price: payload.cost_price ?? '0',
    category: payload.category != null && payload.category > 0 ? payload.category : null,
  })
  return parseInventoryItem(data) as InventoryItem
}

export async function deleteInventoryItem(itemId: number) {
  const id = Math.floor(Number(itemId))
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Identificador de producto no valido.')
  }
  await api.delete(`/inventory/${id}/`)
}

/* ── Códigos de barra / etiquetas ──────────────────────────────────────── */

export function inventoryBarcodePngUrl(itemId: number): string {
  const base = api.defaults.baseURL ?? ''
  return `${base}/inventory/items/${itemId}/barcode.png`
}

async function downloadBlob(url: string, filename: string, params?: Record<string, string | number>) {
  const response = await api.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    params,
    headers: { Accept: 'application/pdf, application/json;q=0.1', 'Cache-Control': 'no-cache' },
    transformResponse: [(data) => data],
  })
  const buf = response.data
  if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0) {
    throw new Error('El servidor devolvió un archivo vacío.')
  }
  const blob = new Blob([buf], { type: 'application/pdf' })
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

export async function downloadEtiquetaProducto(itemId: number, copies: number = 1, sku?: string) {
  const safe = (sku || `item-${itemId}`).replace(/[^A-Za-z0-9_-]/g, '_')
  await downloadBlob(`/inventory/items/${itemId}/etiqueta-pdf/`, `etiqueta_${safe}.pdf`, {
    copies: Math.max(1, Math.floor(copies)),
  })
}

export async function downloadEtiquetasLote(ids: number[], copies: number = 1) {
  if (ids.length === 0) throw new Error('Selecciona al menos un producto.')
  const response = await api.post<ArrayBuffer>(
    '/inventory/etiquetas-lote-pdf/',
    { ids, copies: Math.max(1, Math.floor(copies)) },
    {
      responseType: 'arraybuffer',
      headers: { Accept: 'application/pdf, application/json;q=0.1' },
      transformResponse: [(data) => data],
    },
  )
  const buf = response.data
  if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0) {
    throw new Error('El servidor devolvió un archivo vacío.')
  }
  const blob = new Blob([buf], { type: 'application/pdf' })
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date().toISOString()
  const stamp = `${ts.slice(0, 10)}_${ts.slice(11, 16).replace(':', '')}`
  a.href = objectUrl
  a.download = `etiquetas_lote_${stamp}.pdf`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  queueMicrotask(() => URL.revokeObjectURL(objectUrl))
}

