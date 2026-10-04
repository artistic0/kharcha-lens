/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { privacy } from './tools/vite-privacy.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), privacy()],
  build: {
    target: 'es2022',
    // Inline nothing as data: URLs: every byte the app runs is a plain same-origin file.
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
  server: { port: 5180, strictPort: true },
  preview: { port: 4180, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
