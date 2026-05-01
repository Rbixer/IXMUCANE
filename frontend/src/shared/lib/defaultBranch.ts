/**
 * La empresa opera un solo punto de venta; en base de datos pueden existir filas
 * `Branch` (p. ej. bodegas). Este helper elige el ID del catálogo principal.
 */
export function isWarehouseBranchName(name: string): boolean {
  return /\bbodega\b/i.test(name)
}

export function pickPrimaryInventoryBranchId(branches: { id: number; name: string }[]): number | null {
  const valid = branches.filter((b) => b.id > 0)
  if (!valid.length) return null
  const nonWarehouse = valid.filter((b) => !isWarehouseBranchName(b.name))
  const pool = nonWarehouse.length ? nonWarehouse : valid
  const exact =
    pool.find((b) => b.name.trim().toLowerCase() === 'tienda') ??
    pool.find((b) => b.name.toLowerCase().includes('tienda'))
  return exact?.id ?? pool[0]?.id ?? null
}
