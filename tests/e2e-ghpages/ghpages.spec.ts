import { expect, test } from '@playwright/test'
import { expectedSpend, recordRequests, statementFiles, violations } from '../e2e/helpers'

const HOME = '/kharcha-lens/'

async function open(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __cspViolations: string[] }).__cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window as unknown as { __cspViolations: string[] }).__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  const res = await page.goto(HOME)
  await page.waitForFunction(() => document.body.innerText.includes('Where did my'))
  await page.waitForTimeout(2000)
  return res!
}

test('no headers (like GitHub Pages), still zero requests while analysing two statements', async ({ page, context }) => {
  const files = await statementFiles()
  const res = await open(page)
  // We really are testing without a CSP header…
  expect(res.headers()['content-security-policy']).toBeUndefined()
  // …so the protection must come from the page itself.
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /connect-src 'none'/)

  const requests = recordRequests(context)
  await context.setOffline(true)
  await page.getByTestId('file-input').setInputFiles([files.hdfcPdf, files.iciciXlsx])
  await expect(page.getByRole('heading', { name: 'Where it went' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('hero-spent')).toHaveText(expectedSpend())
  expect(requests.map((r) => r.url())).toEqual([])
  expect(await violations(page)).toEqual([])
})

test('in-page policy blocks sending data even without headers', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(async () => {
    try {
      await fetch('/collect', { method: 'POST', body: 'secret' })
      return 'sent'
    } catch {
      return 'blocked'
    }
  })
  expect(result).toBe('blocked')
})

test('works offline after the first visit, under the sub-path', async ({ page, context }) => {
  await open(page)
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
