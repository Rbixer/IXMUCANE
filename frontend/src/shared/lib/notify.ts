export type BoutiqueToastType = 'success' | 'error' | 'info'

const EVENT = 'boutique-toast'

export type BoutiqueToastDetail = {
  type: BoutiqueToastType
  message: string
}

function emit(detail: BoutiqueToastDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<BoutiqueToastDetail>(EVENT, { detail }))
}

/** Notificación tipo toast (no usar `window.alert`). */
export function notifySuccess(message: string) {
  emit({ type: 'success', message })
}

export function notifyError(message: string) {
  emit({ type: 'error', message })
}

export function notifyInfo(message: string) {
  emit({ type: 'info', message })
}

export const boutiqueToastEventName = EVENT
