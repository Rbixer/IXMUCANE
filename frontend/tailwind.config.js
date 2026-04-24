/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        /** Roboto: línea visual cercana a plantillas MUI / Materially. */
        sans: ['Roboto', 'Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'Times New Roman', 'serif'],
      },
      colors: {
        /**
         * Superficies y texto inspirados en dashboards Material / Materially
         * (fondo gris muy claro, tarjetas blancas, bordes discretos).
         */
        material: {
          canvas: '#f4f6f8',
          surface: '#ffffff',
          'surface-variant': '#f1f5f9',
          outline: '#e8ecf0',
          'outline-strong': '#dce3ea',
          divider: 'rgba(15, 23, 42, 0.06)',
          muted: '#64748b',
          emphasis: '#0f172a',
        },
        /**
         * Marca boutique (rojo). Sustituye el azul anterior de `brand`
         * para que botones existentes coincidan con el panel.
         */
        brand: {
          50: '#fff5f5',
          100: '#ffe4e4',
          200: '#ffc9c9',
          500: '#c40000',
          600: '#a80000',
          900: '#450a0a',
        },
        boutique: {
          50: '#fff5f5',
          100: '#ffe4e4',
          500: '#c40000',
          600: '#a80000',
          700: '#7a0000',
        },
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.08)',
        /** Elevación tipo tarjeta Materially. */
        material: '0 2px 8px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
        /** Barra superior / drawer. */
        'material-nav': '0 1px 3px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
}
