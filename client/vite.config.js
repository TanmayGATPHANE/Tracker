import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

// Expose pkg.version as an env var so source code can read it via
// import.meta.env.VITE_APP_VERSION. Build-time git SHA comes from VITE_GIT_SHA
// (set by Vercel via ^VERCEL_GIT_COMMIT_SHA in the project env).
process.env.VITE_APP_VERSION = pkg.version

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // During dev, calls to /api/* are forwarded to the .NET backend on
      // localhost:5000 (matches the URL .NET binds to by default — see
      // Properties/launchSettings.json). In production (Vercel), this proxy
      // is bypassed and requests go directly to VITE_API_URL set on the
      // Vercel project.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})