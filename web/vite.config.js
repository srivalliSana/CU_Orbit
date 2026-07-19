import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Output lands in server/public/app, served by Express as static assets at
// /app/*, with /portal mapped to its index.html. Keeping it in a subdirectory
// means a build never clobbers the landing page, uploads, or the legacy portal
// that still lives in server/public.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: '../server/public/app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'https://cumess.cutm.ac.in', changeOrigin: true },
      '/uploads': { target: 'https://cumess.cutm.ac.in', changeOrigin: true },
    },
  },
})
