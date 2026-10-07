/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'hsl(355 85% 45%)',
        brandHover: 'hsl(355 85% 40%)',
        cream: 'hsl(40 40% 98%)',
        paper: 'hsl(0 0% 100%)',
        ink: 'hsl(210 10% 12%)',
        muted: 'hsl(210 10% 45%)',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'Times New Roman', 'serif'],
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
