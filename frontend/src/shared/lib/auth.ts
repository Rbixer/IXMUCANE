const ACCESS_KEY = 'boutique_access'
const REFRESH_KEY = 'boutique_refresh'
/** Clave antigua; se migra una vez al nuevo formato */
const LEGACY_TOKEN_KEY = 'boutique_token'

function migrateLegacy() {
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY)?.trim()
  if (!legacy) return
  if (!localStorage.getItem(ACCESS_KEY)) {
    localStorage.setItem(ACCESS_KEY, legacy)
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY)
}

export const authStorage = {
  getToken: () => {
    migrateLegacy()
    return localStorage.getItem(ACCESS_KEY)?.trim() ?? null
  },
  getRefreshToken: () => localStorage.getItem(REFRESH_KEY)?.trim() ?? null,
  setTokens: (access: string, refresh: string) => {
    localStorage.setItem(ACCESS_KEY, access.trim())
    localStorage.setItem(REFRESH_KEY, refresh.trim())
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  },
  /** @deprecated usar setTokens; se mantiene por compatibilidad */
  setToken: (access: string) => {
    localStorage.setItem(ACCESS_KEY, access.trim())
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    localStorage.removeItem('boutique_panel_modules')
    localStorage.removeItem('boutique_is_staff')
    localStorage.removeItem('boutique_acceso')
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('boutique_is_staff')
      sessionStorage.removeItem('boutique_acceso')
      sessionStorage.removeItem('boutique_resumen_admin')
      sessionStorage.removeItem('boutique_panel_branch_id')
    }
  },
  isAuthenticated: () => Boolean(authStorage.getToken()),
}
