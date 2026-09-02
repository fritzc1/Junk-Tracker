import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': {
        // Overridable via VITE_API_PROXY so the dev container can point at the
        // backend service (http://backend-dev:5000); defaults to local dev.
        target: process.env.VITE_API_PROXY || 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  }
})
