/** Debe coincidir con `authentication/panel_modules.py` (`PANEL_MODULE_IDS`). */

export const PANEL_MODULE_ORDER = [
  'dashboard',
  'proveedores',
  'inventario',
  'inventario_bodega_1',
  'inventario_bodega_2',
  'inventario_bodega_3',
  'estadisticas',
  'reportes',
  'pos',
] as const

export type PanelModuleId = (typeof PANEL_MODULE_ORDER)[number]

export const PANEL_MODULE_LABELS: Record<PanelModuleId, string> = {
  dashboard: 'Inicio / Dashboard',
  proveedores: 'Proveedores',
  inventario: 'Inventario (productos, pedidos, stock, carrito)',
  inventario_bodega_1: 'Bodega 1',
  inventario_bodega_2: 'Bodega 2',
  inventario_bodega_3: 'Bodega 3',
  estadisticas: 'Estadísticas',
  reportes: 'Reportes',
  pos: 'POS (vender y facturas)',
}

/** Módulos que el administrador puede marcar (el inicio siempre queda habilitado en el servidor). */
export const PANEL_MODULES_ADMIN_SELECTABLE: readonly PanelModuleId[] = PANEL_MODULE_ORDER.filter(
  (m) => m !== 'dashboard',
)

export function pathRequiresModule(pathname: string, search: string = ''): PanelModuleId | null {
  const p = pathname
  if (p === '/' || p === '/dashboard') return null
  if (p.startsWith('/dashboard')) return null
  if (p.startsWith('/proveedores')) return 'proveedores'
  if (p.startsWith('/inventario/bodegas')) return null
  if (p.startsWith('/inventario/productos')) {
    const slot = new URLSearchParams(search).get('bodega')
    if (slot === '1') return 'inventario_bodega_1'
    if (slot === '2') return 'inventario_bodega_2'
    if (slot === '3') return 'inventario_bodega_3'
    return 'inventario'
  }
  if (p.startsWith('/inventario')) return 'inventario'
  if (p.startsWith('/estadisticas')) return 'estadisticas'
  if (p.startsWith('/reportes')) return 'reportes'
  if (p.startsWith('/pos')) return 'pos'
  if (p.startsWith('/carrito')) return 'inventario'
  if (p.startsWith('/recursos-humanos')) return null
  return null
}

export function withDashboardModules(mods: readonly string[]): PanelModuleId[] {
  const allowed = new Set<string>(PANEL_MODULE_ORDER)
  const seen = new Set<string>()
  for (const x of mods) {
    if (typeof x !== 'string') continue
    const k = x.trim()
    if (k === 'inventario_bodegas') {
      seen.add('inventario_bodega_1')
      seen.add('inventario_bodega_2')
      seen.add('inventario_bodega_3')
      continue
    }
    if (allowed.has(k)) seen.add(k)
  }
  seen.add('dashboard')
  return PANEL_MODULE_ORDER.filter((id) => seen.has(id))
}
