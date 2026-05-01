import { api } from '../../shared/api/client'
import {
  parsePosCustomer,
  parsePosCustomersList,
  parsePosDashboardSummary,
  parsePosQuoteRead,
  parsePosQuotesList,
  parsePosSaleRead,
  parsePosSalesList,
} from '../../shared/api/schemas'
import type { PedidoInventoryLine, StockHierarchyBreakdown } from '../../shared/types/domain'

export type PosPingResponse = {
  module: string
  ok: boolean
}

export type PosSaleLine = {
  id: number
  inventory_item: number
  product_name: string
  sku: string
  quantity: number
  unit_price: string
  jerarquia?: StockHierarchyBreakdown
}

export type PosSale = {
  id: number
  branch: number
  branch_name: string
  customer?: number | null
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  customer_address?: string
  payment_method: 'cash' | 'card' | 'other'
  total: string
  created_at: string
  lines: PosSaleLine[]
}

export type PosSaleListItem = {
  id: number
  branch: number
  branch_name: string
  customer?: number | null
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  customer_address?: string
  payment_method: 'cash' | 'card' | 'other'
  total: string
  created_at: string
  lines_count: number
  /** Suma de cantidades (unidades base) en todas las líneas. */
  total_units: number
  lines?: PedidoInventoryLine[]
}

export type SaleCreatePayload = {
  branch: number
  customer?: number | null
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  customer_address?: string
  payment_method: 'cash' | 'card' | 'other'
  lines: { inventory_item: number; quantity: number }[]
}

export type PosCustomer = {
  id: number
  name: string
  phone: string
  email: string
  address: string
  created_at?: string
}

export type PosDashboardDaily = { date: string | null; count: number; amount: string }

export type PosDashboardBranch = {
  branch_id: number
  branch_name: string
  count: number
  amount: string
}

export type PosDashboardSummary = {
  total_count: number
  total_amount: string
  last_7_days_count: number
  last_7_days_amount: string
  daily: PosDashboardDaily[]
  by_branch: PosDashboardBranch[]
}

export type PosQuoteLine = {
  id: number
  inventory_item: number
  product_name: string
  sku: string
  quantity: number
  unit_kind: 'unit' | 'package' | 'fardo'
  line_unit_price: string
}

export type PosQuote = {
  id: number
  customer_name: string
  customer_nit: string
  notes: string
  total: string
  created_at: string
  lines: PosQuoteLine[]
}

export type PosQuoteListItem = {
  id: number
  customer_name: string
  customer_nit: string
  notes: string
  total: string
  created_at: string
  lines_count: number
}

export type QuoteCreatePayload = {
  customer_name?: string
  customer_nit?: string
  notes?: string
  lines: {
    inventory_item: number
    quantity: number
    unit_kind: 'unit' | 'package' | 'fardo'
    line_unit_price: string
  }[]
}

export type PosCustomerCreatePayload = {
  name: string
  phone?: string
  email?: string
  address?: string
}

export async function fetchPosPing(): Promise<PosPingResponse> {
  const { data } = await api.get<PosPingResponse>('/pos/ping/')
  return data
}

export async function fetchPosDashboardSummary(days?: number): Promise<PosDashboardSummary> {
  const { data } = await api.get('/pos/sales/dashboard-summary/', {
    params: days != null && days > 0 ? { days } : {},
  })
  return parsePosDashboardSummary(data) as PosDashboardSummary
}

export async function listPosSales(branchId?: number): Promise<PosSaleListItem[]> {
  const { data } = await api.get('/pos/sales/', {
    params: branchId != null && branchId > 0 ? { branch: branchId } : {},
  })
  return parsePosSalesList(data) as PosSaleListItem[]
}

/** Construye el detalle tipo recibo desde el listado (el API incluye `lines` en cada venta). */
export function posSaleFromListItem(row: PosSaleListItem): PosSale | null {
  if (!row.lines?.length) return null
  return {
    id: row.id,
    branch: row.branch,
    branch_name: row.branch_name,
    customer: row.customer ?? null,
    customer_name: row.customer_name ?? '',
    customer_phone: row.customer_phone ?? '',
    customer_email: row.customer_email ?? '',
    customer_address: row.customer_address ?? '',
    payment_method: row.payment_method,
    total: row.total,
    created_at: row.created_at,
    lines: row.lines.map((l) => ({
      id: l.id,
      inventory_item: l.inventory_item,
      product_name: l.product_name,
      sku: l.sku,
      quantity: l.quantity,
      unit_price: l.unit_price,
      jerarquia: {
        fardos: l.fardos,
        paquetes: l.paquetes,
        unidades: l.unidades,
        total_unidades: l.quantity,
      },
    })),
  }
}

export async function fetchPosSale(saleId: number): Promise<PosSale> {
  const { data } = await api.get(`/pos/sales/${saleId}/`)
  return parsePosSaleRead(data) as PosSale
}

export async function createPosSale(payload: SaleCreatePayload): Promise<PosSale> {
  const { data } = await api.post('/pos/sales/', payload)
  return parsePosSaleRead(data) as PosSale
}

export async function deletePosSale(saleId: number): Promise<void> {
  await api.delete(`/pos/sales/${saleId}/`)
}

export async function listPosQuotes(): Promise<PosQuoteListItem[]> {
  const { data } = await api.get('/pos/quotes/')
  return parsePosQuotesList(data) as PosQuoteListItem[]
}

export async function fetchPosQuote(quoteId: number): Promise<PosQuote> {
  const { data } = await api.get(`/pos/quotes/${quoteId}/`)
  return parsePosQuoteRead(data) as PosQuote
}

export async function createPosQuote(payload: QuoteCreatePayload): Promise<PosQuote> {
  const { data } = await api.post('/pos/quotes/', payload)
  return parsePosQuoteRead(data) as PosQuote
}

export async function listPosCustomers(search?: string): Promise<PosCustomer[]> {
  const q = (search || '').trim()
  const { data } = await api.get('/pos/customers/', {
    params: q ? { q } : {},
  })
  return parsePosCustomersList(data) as PosCustomer[]
}

export async function createPosCustomer(payload: PosCustomerCreatePayload): Promise<PosCustomer> {
  const { data } = await api.post('/pos/customers/', payload)
  return parsePosCustomer(data) as PosCustomer
}
