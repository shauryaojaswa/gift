import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [react()],
  // Base path per deployment target — never edit this file to switch targets:
  //   npm run build       -> GitHub Pages (https://shauryaojaswa.github.io/gift/)
  //   npm run build:root  -> jriq.in domain root (https://jriq.in/)
  // The dev server always serves at '/' (router basename follows BASE_URL).
  // `--mode root` selects the root base; every other build keeps the Pages base.
  base: command === 'serve' || mode === 'root' ? '/' : '/gift/',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: './src/vitest.setup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
}))
