/** Punto de inventario elegido en modo panel (persiste en sessionStorage). */
const PANEL_BRANCH_KEY = 'boutique_panel_branch_id'

export function getPanelBranchIdFromStorage(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(PANEL_BRANCH_KEY)?.trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function setPanelBranchIdInStorage(id: number | null) {
  if (typeof sessionStorage === 'undefined') return
  if (id == null || !Number.isFinite(id) || id <= 0) {
    sessionStorage.removeItem(PANEL_BRANCH_KEY)
    return
  }
  sessionStorage.setItem(PANEL_BRANCH_KEY, String(Math.floor(id)))
}
