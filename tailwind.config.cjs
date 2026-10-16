/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Shop-themed colors: values resolve through the per-shop CSS custom
        // properties (src/lib/theme.ts + app.css). The <alpha-value> slot keeps
        // every opacity modifier (bg-brand/10, ring-brand/40, ...) working.
        brand: 'hsl(var(--brand-h) var(--brand-s) var(--brand-l) / <alpha-value>)',
        brandHover: 'hsl(var(--brand-hover-h) var(--brand-hover-s) var(--brand-hover-l) / <alpha-value>)',
        gold: 'hsl(var(--secondary-h) var(--secondary-s) var(--secondary-l) / <alpha-value>)',
        cream: 'hsl(38 36% 96%)',
        paper: 'hsl(40 33% 99%)',
        ink: 'hsl(25 14% 17%)',
        muted: 'hsl(26 8% 45%)',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', '"Playfair Display"', 'Georgia', 'Times New Roman', 'serif'],
        body: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
