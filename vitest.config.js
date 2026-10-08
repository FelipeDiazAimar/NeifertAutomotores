import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    // Default node; los tests de componentes ponen `// @vitest-environment jsdom`.
    environment: 'node',
    // Con toda la suite corriendo, algún test de componentes pasaba los 5 s por defecto.
    testTimeout: 15000,
    globals: true, // habilita el auto-cleanup de @testing-library/react entre tests
    include: [
      'src/server/__tests__/**/*.test.{js,jsx}',
      'src/crm/__tests__/**/*.test.{js,jsx}',
      'src/routes/__tests__/**/*.test.{js,jsx}',
      'src/components/**/__tests__/**/*.test.{js,jsx}',
      'src/hooks/__tests__/**/*.test.{js,jsx}',
      'src/lib/__tests__/**/*.test.{js,jsx}',
      // Servidor de WhatsApp (Node puro, sin React).
      'Whatsapp/servidor/test/**/*.test.js',
    ],
    setupFiles: ['./vitest.setup.js'],
  },
})
