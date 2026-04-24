import type { PanelModuleId } from './panelModules'

const ACCESO_KEY = 'boutique_acceso'
const IS_STAFF_KEY = 'boutique_is_staff'
const PANEL_MODULES_KEY = 'boutique_panel_modules'

export type AccesoSesion = 'admin' | 'panel'

/** `boutique_acceso` / `boutique_is_staff`: preferencia de UI tras el login; el API solo valida JWT y permisos por vista. */

/**
 * Lee de localStorage (compartido entre pestañas). Migra una vez desde sessionStorage
 * para sesiones antiguas que solo guardaban ahí.
 */
function readStored(key: string): string | null {
  if (typeof localStorage === 'undefined') return null
  const fromLocal = localStorage.getItem(key)?.trim()
  if (fromLocal) return fromLocal
  if (typeof sessionStorage !== 'undefined') {
    const fromSession = sessionStorage.getItem(key)?.trim()
    if (fromSession) {
      localStorage.setItem(key, fromSession)
      sessionStorage.removeItem(key)
      return fromSession
    }
  }
  return null
}

function writeStored(key: string, value: string) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, value)
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(key)
  }
}

/** Tras login: persistir modo de acceso y staff (localStorage para que sobreviva recarga y nuevas pestañas). */
export function setSesionTrasLogin(acceso: AccesoSesion, isStaff: boolean) {
  writeStored(ACCESO_KEY, acceso)
  writeStored(IS_STAFF_KEY, isStaff ? '1' : '0')
}

/** Sincroniza el flag staff con el perfil del API (evita desajuste si cambió en el servidor). */
export function setStaffFlagDesdePerfil(isStaff: boolean) {
  writeStored(IS_STAFF_KEY, isStaff ? '1' : '0')
}

export function getAccesoSesion(): AccesoSesion | null {
  const v = readStored(ACCESO_KEY)
  return v === 'admin' || v === 'panel' ? v : null
}

export function esStaffSegunAlmacenado(): boolean {
  return readStored(IS_STAFF_KEY) === '1'
}

/** Acceso por el botón Ingresar (sesión «panel»). Las ediciones dependen de `panel_allowed_modules` del perfil. */
export function esModoPanelSoloSeleccion(): boolean {
  return getAccesoSesion() === 'panel'
}

/** Persiste la lista de módulos del perfil (solo sesión panel). Staff: pasar `null` para limpiar. */
export function setPanelModulesDesdePerfil(modules: string[] | null | undefined): void {
  if (typeof localStorage === 'undefined') return
  if (modules == null || !Array.isArray(modules)) {
    localStorage.removeItem(PANEL_MODULES_KEY)
    return
  }
  localStorage.setItem(PANEL_MODULES_KEY, JSON.stringify(modules))
}

function readPanelModulesAlmacenados(): string[] {
  if (typeof localStorage === 'undefined') return []
  const raw = localStorage.getItem(PANEL_MODULES_KEY)
  if (!raw?.trim()) return []
  try {
    const p = JSON.parse(raw) as unknown
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  } catch {
    return []
  }
}

/** En sesión panel: el usuario tiene permiso de uso (incl. crear/editar/eliminar) en ese módulo. En administración siempre true. */
export function panelTieneModuloEscritura(modulo: PanelModuleId): boolean {
  if (!esModoPanelSoloSeleccion()) return true
  return readPanelModulesAlmacenados().includes(modulo)
}

/** Panel sin permiso de edición en ese módulo (solo lectura / carrito según pantalla). */
export function esPanelSoloLecturaEnModulo(modulo: PanelModuleId): boolean {
  return esModoPanelSoloSeleccion() && !panelTieneModuloEscritura(modulo)
}

/** Acceso por Administración: staff con panel completo y creador de usuarios. */
export function esModoAdministracionFull(): boolean {
  return getAccesoSesion() === 'admin'
}

export function puedeGestionarCreadorYVerificacion(): boolean {
  return esModoAdministracionFull() && esStaffSegunAlmacenado()
}
