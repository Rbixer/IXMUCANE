import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { boutiqueToastEventName, type BoutiqueToastDetail } from '../lib/notify'

type ToastItem = BoutiqueToastDetail & { id: string }

const DURATION_MS = 4500

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<BoutiqueToastDetail>
      const d = ce.detail
      if (!d?.message?.trim()) return
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setItems((prev) => [...prev.slice(-4), { ...d, id }])
      window.setTimeout(() => remove(id), DURATION_MS)
    }
    window.addEventListener(boutiqueToastEventName, onToast as EventListener)
    return () => window.removeEventListener(boutiqueToastEventName, onToast as EventListener)
  }, [remove])

  return (
    <>
      {children}
      <div
        className="pointer-events-none fixed inset-0 z-[9998] flex flex-col items-center justify-center gap-2 px-3 py-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-[min(100%,24rem)] items-start gap-3 rounded-xl border px-4 py-3 shadow-material transition-opacity duration-200 ${
              t.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                : t.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-950'
                  : 'border-slate-200 bg-white text-slate-900'
            }`}
            role="status"
          >
            <span className="mt-0.5 shrink-0" aria-hidden>
              {t.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : t.type === 'error' ? (
                <XCircle className="h-5 w-5 text-red-600" />
              ) : (
                <Info className="h-5 w-5 text-slate-600" />
              )}
            </span>
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="shrink-0 rounded-md p-1 text-current opacity-60 hover:opacity-100"
              aria-label="Cerrar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
