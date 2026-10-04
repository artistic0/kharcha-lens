import { defineConfig, devices } from '@playwright/test'

/**
 * Same app, served the way GitHub Pages serves it: under /kharcha-lens/ and with no
 * security headers. Proves the in-page CSP and the worker lockdown hold on their own.
 */
export default defineConfig({
  testDir: 'tests/e2e-ghpages',
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4182', ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
  webServer: {
    command: 'npx vite build && node tools/static-server.mjs 4182 /kharcha-lens/',
    url: 'http://localhost:4182/kharcha-lens/',
    env: { BASE_PATH: '/kharcha-lens/' },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
