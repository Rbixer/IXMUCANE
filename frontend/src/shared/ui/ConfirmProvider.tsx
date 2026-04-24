import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructivo: botón principal en rojo. */
  tone?: 'danger' | 'default'
}

type ConfirmContextValue = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm debe usarse dentro de ConfirmProvider')
  }
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const finish = useCallback((value: boolean) => {
    setOpen(false)
    setOpts(null)
    resolverRef.current?.(value)
    resolverRef.current = null
  }, [])

  const confirm = useCallback((o: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOpts(o)
      setOpen(true)
    })
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])

  const danger = opts?.tone === 'danger'

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {open && opts ? (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-desc"
          onClick={(e) => {
            if (e.target === e.currentTarget) finish(false)
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900">
              {opts.title}
            </h2>
            <p id="confirm-dialog-desc" className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {opts.message}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => finish(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                {opts.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                className={
                  danger
                    ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700'
                    : 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800'
                }
              >
                {opts.confirmLabel ?? 'Continuar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  )
}
