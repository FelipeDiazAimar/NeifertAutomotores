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
    include: [
      'src/server/__tests__/**/*.test.{js,jsx}',
      'src/crm/__tests__/**/*.test.{js,jsx}',
    ],
    setupFiles: ['./vitest.setup.js'],
  },
})
