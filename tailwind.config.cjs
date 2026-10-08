/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'hsl(350 48% 27%)',
        brandHover: 'hsl(350 50% 21%)',
        gold: 'hsl(39 34% 59%)',
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
