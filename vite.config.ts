/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import { privacy } from './tools/vite-privacy.ts'

// Build id shown in the footer and crash report: the commit the site was built from.
const version = process.env.GITHUB_SHA?.slice(0, 7) ?? (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
})()

// https://vite.dev/config/
export default defineConfig({
  // '/' for Cloudflare and local runs; '/<repo>/' for GitHub Pages (set by the deploy workflow).
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss(), privacy()],
  define: { __APP_VERSION__: JSON.stringify(version) },
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
