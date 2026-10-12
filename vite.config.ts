import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In the sandbox the dev server proxies /api to the backend container; outside
// docker it defaults to a local API on port 4000.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
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
