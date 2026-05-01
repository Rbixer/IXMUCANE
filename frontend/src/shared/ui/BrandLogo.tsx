/**
 * BrandLogo — Logotipo oficial de Aluminios Ixmucane
 *
 * Variantes:
 *  - "icon"    → solo el logo cuadrado (sidebar colapsado)
 *  - "full"    → logo + texto "Aluminios Ixmucane" horizontal
 *  - "stacked" → logo + texto apilado (login panel)
 */

type LogoVariant = 'icon' | 'full' | 'stacked'
type LogoTheme   = 'light' | 'dark' | 'auto'

interface BrandLogoProps {
  variant?: LogoVariant
  theme?: LogoTheme
  /** Altura del logo en px (el ancho se ajusta automáticamente) */
  size?: number
  className?: string
}

export function BrandLogo({
  variant = 'full',
  theme = 'light',
  size = 40,
  className = '',
}: BrandLogoProps) {
  const isDark   = theme === 'dark'
  const textMain = isDark ? '#FFFFFF'  : '#0C1220'
  const textSub  = isDark ? '#F59E0B'  : '#B91C1C'

  /* Solo el logo */
  if (variant === 'icon') {
    return (
      <img
        src="/logo-ixmucane.png"
        alt="Aluminios Ixmucane"
        height={size}
        width={size}
        className={`object-contain select-none ${className}`}
        style={{ height: size, width: size }}
        draggable={false}
      />
    )
  }

  /* Logo + wordmark apilado (login) */
  if (variant === 'stacked') {
    return (
      <span className={`inline-flex flex-col items-center gap-2 ${className}`}>
        <img
          src="/logo-ixmucane.png"
          alt="Aluminios Ixmucane"
          style={{ height: size, width: size, objectFit: 'contain' }}
          draggable={false}
        />
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
          <span style={{ fontSize: size * 0.26, fontWeight: 700, letterSpacing: '0.06em', color: textMain, textTransform: 'uppercase', fontFamily: 'inherit' }}>
            Aluminios
          </span>
          <span style={{ fontSize: size * 0.36, fontWeight: 900, letterSpacing: '0.04em', color: textSub, textTransform: 'uppercase', fontFamily: 'inherit' }}>
            IXMUCANE
          </span>
        </span>
      </span>
    )
  }

  /* Logo + wordmark horizontal (sidebar expandido) */
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} style={{ lineHeight: 1 }}>
      <img
        src="/logo-ixmucane.png"
        alt="Aluminios Ixmucane"
        style={{ height: size, width: size, objectFit: 'contain', flexShrink: 0 }}
        draggable={false}
      />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 700, letterSpacing: '0.05em', color: textMain, textTransform: 'uppercase', fontFamily: 'inherit' }}>
          Aluminios
        </span>
        <span style={{ fontSize: size * 0.38, fontWeight: 900, letterSpacing: '0.03em', color: textSub, textTransform: 'uppercase', fontFamily: 'inherit' }}>
          IXMUCANE
        </span>
      </span>
    </span>
  )
}
