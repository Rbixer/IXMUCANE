import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'

type StatCardProps = {
  label: string
  value: string | number
  caption?: string
  icon?: LucideIcon
  /** Clases del contenedor del icono */
  iconWrapClassName?: string
  trend?: string
  trendPositive?: boolean
  onClick?: () => void
  /** Gradiente de fondo opcional para tarjeta destacada */
  gradient?: string
}

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  iconWrapClassName = 'bg-prime-100 text-prime-600',
  trend,
  trendPositive,
  onClick,
  gradient,
}: StatCardProps) {
  const interactive = Boolean(onClick)
  const isLight = !gradient

  return (
    <article
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() }
            }
          : undefined
      }
      style={gradient ? { background: gradient } : undefined}
      className={[
        'group relative overflow-hidden rounded-2xl border p-5 transition-all duration-200',
        gradient
          ? 'border-white/10 text-white shadow-card'
          : 'border-app-border bg-app-surface shadow-card',
        interactive ? 'cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40' : '',
      ].join(' ')}
    >
      {/* Shine en hover */}
      {interactive && (
        <div
          className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: gradient
              ? 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)'
              : 'linear-gradient(135deg, rgba(220,38,38,0.03) 0%, transparent 60%)',
          }}
          aria-hidden
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={[
            'text-[11px] font-semibold uppercase tracking-[0.08em]',
            isLight ? 'text-app-muted' : 'text-white/60',
          ].join(' ')}>
            {label}
          </p>
          <p className={[
            'mt-2 text-3xl font-bold tabular-nums tracking-tight',
            isLight ? 'text-app-text' : 'text-white',
          ].join(' ')}>
            {value}
          </p>
          {caption ? (
            <p className={[
              'mt-1 text-xs leading-snug',
              isLight ? 'text-app-muted' : 'text-white/60',
            ].join(' ')}>
              {caption}
            </p>
          ) : null}
          {trend ? (
            <span
              className={[
                'mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                trendPositive === true
                  ? 'bg-emerald-100 text-emerald-700'
                  : trendPositive === false
                    ? 'bg-red-100 text-red-600'
                    : isLight ? 'bg-app-bg text-app-muted' : 'bg-white/10 text-white/70',
              ].join(' ')}
            >
              {trend}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {Icon ? (
            <div
              className={[
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                gradient ? 'bg-white/15' : iconWrapClassName,
              ].join(' ')}
              aria-hidden
            >
              <Icon size={20} strokeWidth={2} />
            </div>
          ) : null}
          {interactive ? (
            <ArrowUpRight
              size={15}
              className={[
                'shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5',
                isLight ? 'text-app-subtle' : 'text-white/40',
              ].join(' ')}
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </article>
  )
}

type ProgressRowProps = { label: string; pct: number; barClass?: string }

export function StatProgressRow({ label, pct, barClass = 'bg-brand-500' }: ProgressRowProps) {
  const w = Math.min(100, Math.max(0, pct))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-app-text">{label}</span>
        <span className="tabular-nums text-app-muted">{w}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-app-bg">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  )
}
