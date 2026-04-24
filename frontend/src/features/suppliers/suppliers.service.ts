import { api } from '../../shared/api/client'
import {
  parsePurchaseOrderRead,
  parsePurchaseOrdersList,
  parseSupplier,
  parseSuppliersList,
} from '../../shared/api/schemas'
import type { PedidoInventoryLine } from '../../shared/types/domain'

export type Supplier = {
  id: number
  name: string
  contact: string
  nit: string
  razon_social: string
  notes: string
  created_at?: string
}

export type PurchaseLine = PedidoInventoryLine

export type PurchaseOrder = {
  id: number
  supplier: number
  supplier_name: string
  branch: number
  branch_name: string
  reference: string
  created_at: string
  lines: PurchaseLine[]
}

export type PurchaseOrderListItem = {
  id: number
  supplier: number
  supplier_name: string
  branch: number
  branch_name: string
  reference: string
  created_at: string
  lines_count: number
  lines?: PedidoInventoryLine[]
}

export type PurchaseOrderCreatePayload = {
  supplier: number
  branch: number
  reference?: string
  lines: { inventory_item: number; quantity: number }[]
}

export async function listSuppliers(): Promise<Supplier[]> {
  const { data } = await api.get('/suppliers/proveedores/')
  return parseSuppliersList(data) as Supplier[]
}

export async function createSupplier(payload: {
  name?: string
  contact?: string
  nit?: string
  razon_social?: string
  notes?: string
}): Promise<Supplier> {
  const { data } = await api.post('/suppliers/proveedores/', payload)
  return parseSupplier(data) as Supplier
}

export async function deleteSupplier(id: number): Promise<void> {
  await api.delete(`/suppliers/proveedores/${id}/`)
}

export async function listPurchaseOrders(branchId?: number): Promise<PurchaseOrderListItem[]> {
  const { data } = await api.get('/suppliers/ordenes/', {
    params: branchId != null && branchId > 0 ? { branch: branchId } : {},
  })
  return parsePurchaseOrdersList(data) as PurchaseOrderListItem[]
}

export async function createPurchaseOrder(payload: PurchaseOrderCreatePayload): Promise<PurchaseOrder> {
  const { data } = await api.post('/suppliers/ordenes/', payload)
  return parsePurchaseOrderRead(data) as PurchaseOrder
}

export async function deletePurchaseOrder(id: number): Promise<void> {
  await api.delete(`/suppliers/ordenes/${id}/`)
}
