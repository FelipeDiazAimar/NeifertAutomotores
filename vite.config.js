import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { instagramProxyPlugin } from './src/plugins/instagramProxy.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), instagramProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: parseInt(process.env.PORT || '5173'),
    strictPort: false,
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
})
