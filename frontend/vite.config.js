import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In production FastAPI serves this app, so the frontend calls its own origin
// with relative paths. During `npm run dev` those same paths are proxied to the
// local backend, so no environment variable is needed in either case.
const API_PATHS = [
  '/health', '/predict', '/amino-acids', '/titration-curve',
  '/model-metrics', '/model-info', '/ai',
]

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PATHS.map(p => [p, { target: 'http://localhost:8000', changeOrigin: true }])
    ),
  },
})
