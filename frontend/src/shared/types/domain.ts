export type Branch = {
  id: number
  name: string
  city: string
  address: string
  /** Enlace compartido de Google Maps (opcional). */
  maps_url?: string
  manager: string
  is_active?: boolean
  created_at?: string
}

export type InventoryLine = 'ropa-dama' | 'ropa-caballero'

/** Desglose del stock o de una venta en fardo / paquete / unidad (resto). */
export type StockHierarchyBreakdown = {
  fardos: number
  paquetes: number
  unidades: number
  total_unidades: number
}

/** Línea de venta u orden con desglose para tablas de pedidos. */
export type PedidoInventoryLine = {
  id: number
  inventory_item: number
  product_name: string
  sku: string
  display_order: number
  quantity: number
  fardos: number
  paquetes: number
  unidades: number
  cost_price: string
  unit_price: string
}

export type InventoryItem = {
  id: number
  name: string
  sku: string
  quantity: number
  /** Unidades (piezas) por paquete. */
  units_per_package: number
  /** Paquetes por fardo. */
  packages_per_fardo: number
  /** Lectura API: desglose de `quantity` según jerarquía del producto. */
  hierarchy?: StockHierarchyBreakdown
  unit_price: string
  package_price?: string
  fardo_price?: string
  cost_price: string
  branch: number
  line: InventoryLine
  /** Categoría de catálogo (opcional). */
  category?: number | null
  category_name?: string
  display_order: number
  /** URL absoluta del API si hay foto subida. */
  image_url?: string
  created_at?: string
}

export type ProductCategory = {
  id: number
  name: string
  line: InventoryLine | ''
  created_at?: string
}

export type StockMovement = {
  id: number
  inventory_item: number
  product_name?: string
  existencia_actual?: number
  movement_type: 'IN' | 'OUT'
  quantity: number
  note: string
  created_at: string
}
