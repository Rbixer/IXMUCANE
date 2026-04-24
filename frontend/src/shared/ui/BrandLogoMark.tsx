/**
 * Logo de marca Aluminios Ixmucane (`/brand-logo-boutique.png` en `public/`).
 * object-contain conserva proporción en el marco indicado.
 */
const LOGO_SRC = '/brand-logo-boutique.png'

type Props = {
  className?: string
  /** Marco máximo: alto principal, ancho tope para no aplastar el dibujo. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const sizeClass: Record<NonNullable<Props['size']>, string> = {
  /** Sidebar junto al nombre (menú colapsado o expandido). */
  xs: 'h-9 w-auto max-w-[4.5rem] sm:h-10 sm:max-w-[5.25rem]',
  sm: 'h-11 w-auto max-w-[12rem] sm:h-12 sm:max-w-[13rem]',
  md: 'h-14 w-auto max-w-[15rem] sm:h-16 sm:max-w-[17rem]',
  lg: 'h-24 w-auto max-w-[min(92vw,16rem)] sm:h-28 sm:max-w-[18rem]',
}

export function BrandLogoMark({ className = '', size = 'md' }: Props) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center ${sizeClass[size]} ${className}`}
      role="img"
      aria-label="Aluminios Ixmucane"
    >
      <img
        src={LOGO_SRC}
        alt=""
        width={440}
        height={220}
        decoding="async"
        className="max-h-full max-w-full object-contain object-center"
      />
    </div>
  )
}
