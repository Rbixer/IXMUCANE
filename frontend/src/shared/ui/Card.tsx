import type { PropsWithChildren, ReactNode } from 'react'

type CardProps = PropsWithChildren<{
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
  /** Gradiente de borde superior de acento (clase Tailwind o CSS inline) */
  accent?: string
}>

export function Card({ title, subtitle, action, children, className, accent }: CardProps) {
  return (
    <section
      className={[
        'overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-card',
        className ?? 'p-6',
      ].join(' ')}
    >
      {accent ? (
        <div className={`mb-0 h-[3px] ${accent}`} aria-hidden />
      ) : null}
      <div className={accent ? 'p-6' : ''}>
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-app-text">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-app-muted">{subtitle}</p> : null}
          </div>
          {action}
        </header>
        {children}
      </div>
    </section>
  )
}
