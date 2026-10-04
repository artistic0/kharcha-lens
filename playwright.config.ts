import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against `vite preview`, which serves the production build with the
 * same CSP and headers as the real site.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4181',
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }, testIgnore: /mobile.spec.ts/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4181 --strictPort',
    url: 'http://localhost:4181',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
