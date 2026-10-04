import { expect, test } from '@playwright/test'
import { expectedSpend, nav, openApp, recategorize, recordRequests, statementFiles, violations } from './helpers'

test.describe('the privacy promise', () => {
  test('two statements are analysed offline with zero network requests', async ({ page, context }) => {
    const files = await statementFiles()
    await openApp(page)
    const requests = recordRequests(context)
    await context.setOffline(true)

    await page.getByTestId('file-input').setInputFiles([files.hdfcPdf, files.iciciXlsx])
    await expect(page.getByRole('heading', { name: 'Where it went' })).toBeVisible({ timeout: 20_000 })

    // Totals match the known answers (self-transfers excluded, refund netted).
    await expect(page.getByTestId('hero-spent')).toHaveText(expectedSpend())
    await page.screenshot({ path: 'test-results/screens/overview.png', fullPage: true })

    await nav(page, /^Compare/)
    await expect(page.getByRole('heading', { name: 'Aug 2026 vs Sept 2026' })).toBeVisible()
    await page.screenshot({ path: 'test-results/screens/compare.png', fullPage: true })
    await page.getByRole('radio', { name: 'All months' }).click()
    await expect(page.getByRole('heading', { name: 'Every category, every month' })).toBeVisible()
    await page.screenshot({ path: 'test-results/screens/compare-grid.png', fullPage: true })
    await page.getByRole('radio', { name: 'Accounts' }).click()
    await expect(page.getByRole('heading', { name: 'Side by side' })).toBeVisible()
    await page.screenshot({ path: 'test-results/screens/compare-accounts.png', fullPage: true })

    await nav(page, /^Self-transfers/)
    await expect(page.locator('main li', { hasText: 'Not a self-transfer' })).toHaveCount(4)
    await expect(page.locator('main')).not.toContainText('RAHUL KUMAR')
    await expect(page.locator('main')).not.toContainText('PRIYA NAIR')

    await nav(page, /^Recurring/)
    await expect(page.locator('main')).toContainText('Price up ₹499 → ₹649')
    await expect(page.locator('main')).toContainText('Trial turned paid')
    await page.screenshot({ path: 'test-results/screens/recurring.png', fullPage: true })

    await nav(page, /^Transactions/)
    await page.screenshot({ path: 'test-results/screens/transactions.png' })
    await page.locator('main').getByRole('button', { name: /^Netflix/ }).first().click()
    await expect(page.getByRole('dialog')).toContainText('Why Subscriptions?')
    await page.screenshot({ path: 'test-results/screens/transaction-sheet.png' })
    await page.keyboard.press('Escape')

    await nav(page, /^Statements/)
    await expect(page.locator('main')).toContainText('Balances check out (100%)')

    expect(requests.map((r) => r.url())).toEqual([])
    expect(await violations(page)).toEqual([])
    // The live counter agrees.
    await expect(page.getByRole('button', { name: /^0 network requests since the page loaded/ })).toBeVisible()
  })

  test('the page cannot send data anywhere, even to its own server', async ({ page }) => {
    await openApp(page)
    const results = await page.evaluate(async () => {
      const attempt = async (fn: () => Promise<unknown>) => {
        try {
          await fn()
          return 'sent'
        } catch {
          return 'blocked'
        }
      }
      return {
        external: await attempt(() => fetch('https://example.com/collect', { method: 'POST', body: 'secret' })),
        sameOrigin: await attempt(() => fetch('/collect', { method: 'POST', body: 'secret' })),
      }
    })
    expect(results.external).toBe('blocked')
    expect(results.sameOrigin).toBe('blocked')
    const v = await violations(page)
    expect(v.some((x) => x.startsWith('connect-src'))).toBe(true)
  })

  test('nothing is stored by default; opt-in storage holds rules only, never transactions', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Try sample data' }).click()
    await nav(page, /^Transactions/)
    await recategorize(page, 'SHARMA GENERAL STORE', 'Food & dining')
    const dump = () =>
      page.evaluate(() => {
        const out: Record<string, string> = {}
        for (let i = 0; i < localStorage.length; i++) out[localStorage.key(i)!] = localStorage.getItem(localStorage.key(i)!)!
        return { local: out, session: sessionStorage.length, cookies: document.cookie }
      })
    expect(await dump()).toEqual({ local: {}, session: 0, cookies: '' })

    await nav(page, /^Privacy/)
    await page.getByLabel('Remember my category rules on this device').check()
    const stored = (await dump()).local
    const raw = Object.values(stored).join('\n')
    expect(Object.keys(stored)).toEqual(['kharchalens.rules.v1'])
    expect(JSON.parse(raw).payeeCategory).toBeTruthy()
    expect(raw).not.toMatch(/NEFT|UPI-|ACME|2026-|\d{4,}\.\d\d|balance/i)

    await page.reload()
    await page.getByRole('button', { name: 'Try sample data' }).click()
    await nav(page, /^Transactions/)
    await page.getByLabel('Search').fill('SHARMA GENERAL STORE')
    await expect(page.locator('main').getByRole('button', { name: /^SHARMA GENERAL STORE, Food & dining/ })).toHaveCount(6)

    await nav(page, /^Privacy/)
    await page.getByLabel('Remember my category rules on this device').uncheck()
    expect((await dump()).local).toEqual({})
  })

  test('works offline after the first visit (service worker)', async ({ page, context }) => {
    await openApp(page)
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: /money go\?/ })).toBeVisible()
    await page.getByRole('button', { name: 'Try sample data' }).click()
    await expect(page.getByRole('heading', { name: 'Where it went' })).toBeVisible()
  })
})

test.describe('reading statements', () => {
  test('password-protected PDF: wrong password, then right one', async ({ page }) => {
    const files = await statementFiles()
    await openApp(page)
    await page.screenshot({ path: 'test-results/screens/landing.png', fullPage: true })
    await page.getByTestId('file-input').setInputFiles([files.lockedPdf])
    await expect(page.getByText('Password needed')).toBeVisible({ timeout: 20_000 })
    await page.getByLabel('PDF password').fill('wrong')
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page.getByText('Wrong password')).toBeVisible()
    await page.getByLabel('PDF password').fill('rahu0101')
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Where it went' })).toBeVisible({ timeout: 20_000 })
  })

  test('scanned PDF gets a clear message instead of wrong numbers', async ({ page }) => {
    const files = await statementFiles()
    await openApp(page)
    await page.getByTestId('file-input').setInputFiles([files.scannedPdf])
    await expect(page.getByText('Couldn’t read')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('main')).toContainText('looks scanned')
  })

  test('re-categorizing a payee updates every payment and can be undone', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Try sample data' }).click()
    await nav(page, /^Transactions/)
    await recategorize(page, 'SHARMA GENERAL STORE', 'Food & dining')
    await expect(page.getByRole('status').filter({ hasText: 'All 6 payments' })).toBeVisible()
    const rows = (cat: string) => page.locator('main').getByRole('button', { name: new RegExp(`^SHARMA GENERAL STORE, ${cat}`) })
    await expect(rows('Food & dining')).toHaveCount(6)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(rows('Groceries')).toHaveCount(6)
  })

  test('adding more statements from the dashboard', async ({ page }) => {
    const files = await statementFiles()
    await openApp(page)
    await page.getByTestId('file-input').setInputFiles([files.hdfcPdf])
    await expect(page.getByRole('heading', { name: 'Where it went' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Add statements' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add statements' })
    await dialog.getByTestId('file-input').setInputFiles([files.iciciXlsx])
    await expect(dialog.getByText('Added')).toHaveCount(1, { timeout: 20_000 })
    await page.screenshot({ path: 'test-results/screens/add-dialog.png' })
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTestId('hero-spent')).toHaveText(expectedSpend())
  })

  test('dark mode renders', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await openApp(page)
    await page.screenshot({ path: 'test-results/screens/landing-dark.png', fullPage: true })
    await page.getByRole('button', { name: 'Try sample data' }).click()
    await expect(page.getByRole('heading', { name: 'Where it went' })).toBeVisible()
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).toBe('rgb(11, 12, 18)')
    await page.screenshot({ path: 'test-results/screens/overview-dark.png', fullPage: true })
  })
})
