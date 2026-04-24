import type { PropsWithChildren, ReactNode } from 'react'

type CardProps = PropsWithChildren<{
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}>

export function Card({ title, subtitle, action, children, className }: CardProps) {
  return (
    <section
      className={`rounded-xl border border-material-outline bg-material-surface shadow-material ${className ?? 'p-6'}`}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-material-emphasis">{title}</h2>
          {subtitle ? <p className="text-sm text-material-muted">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
