import { api } from '../../shared/api/client'
import { parseBranchesList } from '../../shared/api/schemas'
import type { Branch } from '../../shared/types/domain'

/** Listado de tiendas vía inventario (endpoint consolidado). */
export async function listBranches(): Promise<Branch[]> {
  const { data } = await api.get('/inventory/locales/')
  return parseBranchesList(data) as Branch[]
}
