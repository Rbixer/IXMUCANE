/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      colors: {
        /* ── Brand rojo forja ──────────────────────────────────────────── */
        brand: {
          50:  '#FFF5F5',
          100: '#FFE4E4',
          200: '#FFBCBC',
          300: '#FF8585',
          400: '#FF4D4D',
          500: '#DC2626',
          600: '#B91C1C',
          700: '#991B1B',
          800: '#7F1D1D',
          900: '#450A0A',
        },
        /* ── Ámbar industrial / metálico ───────────────────────────────── */
        ix: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        /* ── Violet moderno ────────────────────────────────────────────── */
        prime: {
          50:  '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
        },
        /* ── Sistema de superficies (fondo claro) ──────────────────────── */
        app: {
          bg:              '#F0F2F8',
          'bg-2':          '#E8EBF4',
          surface:         '#FFFFFF',
          'surface-hover': '#F8F9FD',
          border:          '#E2E6F0',
          'border-strong': '#C8CEDF',
          text:            '#0C1220',
          muted:           '#556070',
          subtle:          '#8A95AA',
        },
        /* ── Sidebar claro ─────────────────────────────────────────────── */
        sidebar: {
          DEFAULT:       '#FFFFFF',
          hover:         '#F4F6FB',
          active:        '#FEF2F2',
          border:        '#E4E8F2',
          text:          '#64718A',
          'text-active': '#B91C1C',
          accent:        '#DC2626',
          section:       '#9FAABB',
        },
        /* ── Backward compat ───────────────────────────────────────────── */
        material: {
          canvas:           '#F0F2F8',
          surface:          '#FFFFFF',
          'surface-variant':'#F3F5FB',
          outline:          '#E2E6F0',
          'outline-strong': '#C8CEDF',
          divider:          'rgba(12,18,32,0.06)',
          muted:            '#556070',
          emphasis:         '#0C1220',
        },
        boutique: {
          50:  '#FFF5F5',
          100: '#FFE4E4',
          200: '#FFBCBC',
          500: '#DC2626',
          600: '#B91C1C',
          700: '#991B1B',
        },
      },
      boxShadow: {
        card:           '0 1px 3px rgba(12,18,32,0.04), 0 6px 20px rgba(12,18,32,0.07)',
        'card-hover':   '0 4px 14px rgba(12,18,32,0.09), 0 18px 44px rgba(12,18,32,0.11)',
        nav:            '0 1px 0 rgba(12,18,32,0.08)',
        modal:          '0 8px 32px rgba(12,18,32,0.18)',
        'brand-glow':   '0 0 18px rgba(220,38,38,0.40)',
        'ix-glow':      '0 0 18px rgba(245,158,11,0.42)',
        /* sidebar item active */
        'sidebar-item': '0 0 0 1px rgba(251,191,36,0.12), inset 0 0 12px rgba(251,191,36,0.05)',
        /* compat */
        material:       '0 1px 3px rgba(12,18,32,0.04), 0 6px 20px rgba(12,18,32,0.07)',
        soft:           '0 8px 30px rgba(12,18,32,0.10)',
        'material-nav': '0 1px 0 rgba(12,18,32,0.08)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #DC2626 0%, #9A1515 60%, #200505 100%)',
        'ix-gradient':    'linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)',
        'forge':          'linear-gradient(135deg, #7F1D1D 0%, #DC2626 30%, #F59E0B 100%)',
        'sidebar-mesh':
          'radial-gradient(ellipse at 25% 8%,  rgba(220,38,38,0.09) 0%, transparent 48%),' +
          'radial-gradient(ellipse at 82% 82%, rgba(245,158,11,0.07) 0%, transparent 50%)',
        'hero-dark':
          'radial-gradient(ellipse at 18% 18%, rgba(220,38,38,0.26) 0%, transparent 48%),' +
          'radial-gradient(ellipse at 78% 76%, rgba(245,158,11,0.20) 0%, transparent 50%),' +
          'radial-gradient(ellipse at 55% 50%, rgba(139,92,246,0.08) 0%, transparent 60%),' +
          'linear-gradient(160deg, #07090F 0%, #0D0F1C 55%, #100A0A 100%)',
        'card-hero':      'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.75rem',
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1'  },
          '50%':      { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
}
