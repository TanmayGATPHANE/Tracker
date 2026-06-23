import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // During dev, calls to /api/* are forwarded to the .NET backend on
      // localhost:5198. In production (Vercel), this proxy is bypassed and
      // requests go directly to VITE_API_URL set on the Vercel project.
      '/api': {
        target: 'http://localhost:5198',
        changeOrigin: true,
      },
    },
  },
})