import { z } from 'zod'

/** Convierte respuestas JSON impredecibles (p. ej. Decimal como número) a tipos del dominio. */
function parseApi<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const r = schema.safeParse(data)
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new Error(`${label}: respuesta invalida del servidor (${detail})`)
  }
  return r.data
}

const boolCoerce = z.preprocess((v) => {
  if (v === true || v === 'true' || v === 1) return true
  if (v === false || v === 'false' || v === 0) return false
  return v
}, z.boolean())

const idCoerce = z.coerce.number().int().positive()

const priceString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))

export const loginResponseSchema = z.object({
  access: z.string().min(1),
  refresh: z.string().min(1),
})

export const userProfileSchema = z.object({
  id: idCoerce,
  username: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  is_staff: boolCoerce,
  is_superuser: boolCoerce,
  personnel_codigo: z.string(),
  personnel_nombre_completo: z.string(),
  personnel_branch_id: z.union([z.null(), idCoerce]).optional(),
  personnel_branch_name: z.string().optional(),
  /** Staff: null (acceso total). Panel: lista de módulos permitidos. */
  panel_allowed_modules: z.union([z.null(), z.array(z.string())]).optional(),
})

export const branchSchema = z.object({
  id: idCoerce,
  name: z.string(),
  city: z.string(),
  address: z.string(),
  maps_url: z.string().optional().default(''),
  manager: z.string(),
  is_active: boolCoerce.optional(),
  created_at: z.string().optional(),
})

export const inventoryLineSchema = z.enum(['ropa-dama', 'ropa-caballero'])

const stockHierarchySchema = z.object({
  fardos: z.coerce.number().int().min(0),
  paquetes: z.coerce.number().int().min(0),
  unidades: z.coerce.number().int().min(0),
  total_unidades: z.coerce.number().int().min(0),
})

export const inventoryItemSchema = z.object({
  id: idCoerce,
  name: z.string(),
  sku: z.string(),
  quantity: z.coerce.number().int().min(0),
  units_per_package: z.coerce.number().int().min(1).default(1),
  packages_per_fardo: z.coerce.number().int().min(1).default(1),
  hierarchy: stockHierarchySchema.optional(),
  unit_price: priceString,
  cost_price: priceString.optional().default('0.00'),
  branch: idCoerce,
  line: inventoryLineSchema,
  category: z.union([z.null(), idCoerce]).optional(),
  category_name: z.string().optional().default(''),
  display_order: z.coerce.number().int().min(0),
  image_url: z.string().optional(),
  created_at: z.string().optional(),
})

const categoryLineSchema = z.union([inventoryLineSchema, z.literal('')])

export const productCategorySchema = z.object({
  id: idCoerce,
  name: z.string(),
  line: categoryLineSchema,
  created_at: z.string().optional(),
})

export const branchInventoryCountsSchema = z.object({
  total: z.coerce.number().int().min(0),
  'ropa-dama': z.coerce.number().int().min(0),
  'ropa-caballero': z.coerce.number().int().min(0),
  stock_movimientos: z.coerce.number().int().min(0),
})

export const stockMovementSchema = z.object({
  id: idCoerce,
  inventory_item: idCoerce,
  product_name: z.string().optional(),
  existencia_actual: z.coerce.number().int().optional(),
  movement_type: z.enum(['IN', 'OUT']),
  quantity: z.coerce.number().int().positive(),
  note: z.string(),
  created_at: z.string(),
})

export function parseLoginResponse(data: unknown) {
  return parseApi(loginResponseSchema, data, 'auth/token')
}

export function parseUserProfile(data: unknown) {
  return parseApi(userProfileSchema, data, 'auth/profile')
}

export function parseBranchesList(data: unknown) {
  return parseApi(z.array(branchSchema), data, 'inventory/locales')
}

export function parseBranch(data: unknown) {
  return parseApi(branchSchema, data, 'branch')
}

export function parseInventoryList(data: unknown) {
  return parseApi(z.array(inventoryItemSchema), data, 'inventory')
}

export function parseInventoryItem(data: unknown) {
  return parseApi(inventoryItemSchema, data, 'inventory/item')
}

export function parseInventoryBranchSummary(data: unknown) {
  return parseApi(z.record(z.string(), branchInventoryCountsSchema), data, 'inventory/summary-by-branch')
}

export function parseStockMovementsList(data: unknown) {
  return parseApi(z.array(stockMovementSchema), data, 'stock')
}

const paymentMethodSchema = z.enum(['cash', 'card', 'other'])

/** Línea de venta u orden (recepción) con desglose f/p/u y precios. */
export const pedidoInventoryLineSchema = z.object({
  id: idCoerce,
  inventory_item: idCoerce,
  product_name: z.string(),
  sku: z.string(),
  display_order: z.coerce.number().int().min(0).default(0),
  quantity: z.coerce.number().int().min(0),
  fardos: z.coerce.number().int().min(0),
  paquetes: z.coerce.number().int().min(0),
  unidades: z.coerce.number().int().min(0),
  cost_price: priceString,
  unit_price: priceString,
})

export const posSaleLineReadSchema = z.object({
  id: idCoerce,
  inventory_item: idCoerce,
  product_name: z.string(),
  sku: z.string(),
  quantity: z.coerce.number().int().positive(),
  unit_price: priceString,
  jerarquia: stockHierarchySchema.optional(),
})

export const posSaleReadSchema = z.object({
  id: idCoerce,
  branch: idCoerce,
  branch_name: z.string(),
  payment_method: paymentMethodSchema,
  total: priceString,
  created_at: z.string(),
  lines: z.array(posSaleLineReadSchema),
})

export const posSaleListItemSchema = z.object({
  id: idCoerce,
  branch: idCoerce,
  branch_name: z.string(),
  payment_method: paymentMethodSchema,
  total: priceString,
  created_at: z.string(),
  lines_count: z.coerce.number().int().min(0),
  total_units: z.coerce.number().int().min(0).default(0),
  lines: z.array(pedidoInventoryLineSchema).optional(),
})

export function parsePosSaleRead(data: unknown) {
  return parseApi(posSaleReadSchema, data, 'pos/sale')
}

export function parsePosSalesList(data: unknown) {
  return parseApi(z.array(posSaleListItemSchema), data, 'pos/sales')
}

const posDashboardDailySchema = z.object({
  date: z.union([z.string(), z.null()]),
  count: z.coerce.number().int().min(0),
  amount: priceString,
})

const posDashboardBranchSchema = z.object({
  branch_id: idCoerce,
  branch_name: z.string(),
  count: z.coerce.number().int().min(0),
  amount: priceString,
})

export const posDashboardSummarySchema = z.object({
  total_count: z.coerce.number().int().min(0),
  total_amount: priceString,
  last_7_days_count: z.coerce.number().int().min(0),
  last_7_days_amount: priceString,
  daily: z.array(posDashboardDailySchema),
  by_branch: z.array(posDashboardBranchSchema),
})

export function parsePosDashboardSummary(data: unknown) {
  return parseApi(posDashboardSummarySchema, data, 'pos/sales/dashboard-summary')
}

export function parseProductCategoriesList(data: unknown) {
  return parseApi(z.array(productCategorySchema), data, 'inventory/categories')
}

export function parseProductCategory(data: unknown) {
  return parseApi(productCategorySchema, data, 'inventory/category')
}

const optionalStr = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null ? '' : String(v)))

export const supplierSchema = z.object({
  id: idCoerce,
  name: optionalStr,
  contact: optionalStr,
  nit: optionalStr,
  razon_social: optionalStr,
  notes: optionalStr,
  created_at: z.string().optional(),
})

export const purchaseLineReadSchema = pedidoInventoryLineSchema

export const purchaseOrderReadSchema = z.object({
  id: idCoerce,
  supplier: idCoerce,
  supplier_name: z.string(),
  branch: idCoerce,
  branch_name: z.string(),
  reference: z.string(),
  created_at: z.string(),
  lines: z.array(purchaseLineReadSchema),
})

export const purchaseOrderListItemSchema = z.object({
  id: idCoerce,
  supplier: idCoerce,
  supplier_name: z.string(),
  branch: idCoerce,
  branch_name: z.string(),
  reference: z.string(),
  created_at: z.string(),
  lines_count: z.coerce.number().int().min(0),
  lines: z.array(pedidoInventoryLineSchema).optional(),
})

export function parseSuppliersList(data: unknown) {
  return parseApi(z.array(supplierSchema), data, 'suppliers/proveedores')
}

export function parseSupplier(data: unknown) {
  return parseApi(supplierSchema, data, 'suppliers/proveedor')
}

export function parsePurchaseOrderRead(data: unknown) {
  return parseApi(purchaseOrderReadSchema, data, 'suppliers/orden')
}

export function parsePurchaseOrdersList(data: unknown) {
  return parseApi(z.array(purchaseOrderListItemSchema), data, 'suppliers/ordenes')
}
