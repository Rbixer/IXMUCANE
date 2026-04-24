import { api } from '../../shared/api/client'
import { parsePosDashboardSummary, parsePosSaleRead, parsePosSalesList } from '../../shared/api/schemas'
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
  payment_method: 'cash' | 'card' | 'other'
  total: string
  created_at: string
  lines: PosSaleLine[]
}

export type PosSaleListItem = {
  id: number
  branch: number
  branch_name: string
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
  payment_method: 'cash' | 'card' | 'other'
  lines: { inventory_item: number; quantity: number }[]
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

export async function createPosSale(payload: SaleCreatePayload): Promise<PosSale> {
  const { data } = await api.post('/pos/sales/', payload)
  return parsePosSaleRead(data) as PosSale
}

export async function deletePosSale(saleId: number): Promise<void> {
  await api.delete(`/pos/sales/${saleId}/`)
}
