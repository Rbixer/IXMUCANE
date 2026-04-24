import type { LucideIcon } from 'lucide-react'

type StatCardProps = {
  label: string
  value: string | number
  /** Texto secundario bajo el valor (p. ej. variación o contexto). */
  caption?: string
  icon?: LucideIcon
  /** Clases del contenedor del icono (fondo suave). */
  iconWrapClassName?: string
  trend?: string
  /** Si no se indica, el trend se muestra en color neutro. */
  trendPositive?: boolean
  onClick?: () => void
}

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  iconWrapClassName = 'bg-boutique-50 text-boutique-600',
  trend,
  trendPositive,
  onClick,
}: StatCardProps) {
  const interactive = Boolean(onClick)
  return (
    <article
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={`relative overflow-hidden rounded-xl border border-material-outline bg-material-surface p-5 shadow-material ${
        interactive
          ? 'cursor-pointer transition hover:border-boutique-200 hover:shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-boutique-500/40'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-material-muted">{label}</p>
          <p className="mt-2 text-3xl font-normal tabular-nums tracking-tight text-material-emphasis">{value}</p>
          {caption ? <p className="mt-1 text-xs text-material-muted">{caption}</p> : null}
          {trend ? (
            <p
              className={`mt-2 text-xs font-medium ${
                trendPositive === true
                  ? 'text-emerald-600'
                  : trendPositive === false
                    ? 'text-red-600'
                    : 'text-material-muted'
              }`}
            >
              {trend}
            </p>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconWrapClassName}`}
            aria-hidden
          >
            <Icon size={22} strokeWidth={2} />
          </div>
        ) : null}
      </div>
    </article>
  )
}

type ProgressRowProps = { label: string; pct: number; barClass?: string }

export function StatProgressRow({ label, pct, barClass = 'bg-boutique-500' }: ProgressRowProps) {
  const w = Math.min(100, Math.max(0, pct))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-material-emphasis">{label}</span>
        <span className="tabular-nums text-material-muted">{w}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-material-surface-variant">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  )
}
