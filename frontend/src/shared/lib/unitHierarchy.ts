/** Desglose fardo → paquete → unidad (cantidad siempre en unidades base). */

export function splitStockHierarchy(
  totalUnits: number,
  unitsPerPackage: number,
  packagesPerFardo: number,
): { fardos: number; paquetes: number; unidades: number } {
  const upp = Math.max(1, Math.floor(unitsPerPackage) || 1)
  const ppf = Math.max(1, Math.floor(packagesPerFardo) || 1)
  const perFardo = upp * ppf
  const t = Math.max(0, Math.floor(totalUnits) || 0)
  const fardos = Math.floor(t / perFardo)
  const rem = t % perFardo
  const paquetes = Math.floor(rem / upp)
  const unidades = rem % upp
  return { fardos, paquetes, unidades }
}

export function formatHierarchyLabel(fardos: number, paquetes: number, unidades: number): string {
  return `${fardos} f · ${paquetes} pq · ${unidades} u`
}

/** Stock total en unidades a partir de fardos + paquetes + unidades sueltas y la jerarquía del producto. */
export function totalUnitsFromHierarchy(
  fardos: number,
  paquetes: number,
  unidadesSueltas: number,
  unitsPerPackage: number,
  packagesPerFardo: number,
): number {
  const upp = Math.max(1, Math.floor(unitsPerPackage) || 1)
  const ppf = Math.max(1, Math.floor(packagesPerFardo) || 1)
  const perFardo = upp * ppf
  const f = Math.max(0, Math.floor(fardos) || 0)
  const p = Math.max(0, Math.floor(paquetes) || 0)
  const u = Math.max(0, Math.floor(unidadesSueltas) || 0)
  return f * perFardo + p * upp + u
}
