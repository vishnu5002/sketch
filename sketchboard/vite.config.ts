import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the API runs separately (see run-dev.sh) against its own database.
const API_PORT = Number(process.env.SKETCHBOARD_API_PORT || 5185)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
      '/healthz': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
    },
  },
})
