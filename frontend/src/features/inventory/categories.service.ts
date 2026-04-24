import { api } from '../../shared/api/client'
import { parseProductCategoriesList, parseProductCategory } from '../../shared/api/schemas'
import type { ProductCategory } from '../../shared/types/domain'

export type ListCategoriesParams = { line?: string }

export async function listProductCategories(params?: ListCategoriesParams): Promise<ProductCategory[]> {
  const { data } = await api.get('/inventory/categories/', { params })
  return parseProductCategoriesList(data) as ProductCategory[]
}

export type CategoryPayload = { name: string; line: '' | 'ropa-dama' | 'ropa-caballero' }

export async function createProductCategory(payload: CategoryPayload): Promise<ProductCategory> {
  const { data } = await api.post('/inventory/categories/', payload)
  return parseProductCategory(data) as ProductCategory
}

export async function updateProductCategory(
  id: number,
  payload: Partial<CategoryPayload>,
): Promise<ProductCategory> {
  const { data } = await api.patch(`/inventory/categories/${id}/`, payload)
  return parseProductCategory(data) as ProductCategory
}

export async function deleteProductCategory(id: number) {
  await api.delete(`/inventory/categories/${id}/`)
}
