import { api } from '../../shared/api/client'
import { parseStockMovementsList } from '../../shared/api/schemas'
import type { StockMovement } from '../../shared/types/domain'

export type ListStockParams = {
  branch?: number | string
}

export async function listStockMovements(params?: ListStockParams) {
  const { data } = await api.get('/stock/', { params })
  return parseStockMovementsList(data) as StockMovement[]
}
