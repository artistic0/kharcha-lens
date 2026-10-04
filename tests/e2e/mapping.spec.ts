import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { expectedSpendB, nav, openApp, recordRequests, unknownLayoutCsv, violations } from './helpers'

test('a bank the app has never seen: fix columns once, then it just works', async ({ page, context }) => {
  await openApp(page)
  const requests = recordRequests(context)
  await context.setOffline(true)

  // 1. Unknown column titles: the reader stops and offers the wizard.
  await page.getByTestId('file-input').setInputFiles([unknownLayoutCsv()])
  await expect(page.getByText('Couldn’t read')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Fix columns' }).click()

  // 2. The wizard's guesses are already right, and the balance check proves it.
  const dialog = page.getByRole('dialog', { name: /Fix columns/ })
  await expect(dialog.getByLabel(/^Column 1/)).toHaveValue('date')
  await expect(dialog.getByLabel(/^Column 2/)).toHaveValue('narration')
  await expect(dialog.getByLabel(/^Column 3/)).toHaveValue('debit')
  await expect(dialog.getByLabel(/^Column 4/)).toHaveValue('credit')
  await expect(dialog.getByLabel(/^Column 5/)).toHaveValue('balance')
  await expect(dialog.getByText('Balances check out (100%)')).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/fix-columns.png' })

  // A wrong choice shows up immediately.
  await dialog.getByLabel(/^Column 3/).selectOption('credit')
  await expect(dialog.getByText(/Only \d+% of balances check out/)).toBeVisible()
  await dialog.getByLabel(/^Column 3/).selectOption('debit')
  await dialog.getByLabel(/^Column 4/).selectOption('credit')
  await expect(dialog.getByText('Balances check out (100%)')).toBeVisible()

  const a11y = await new AxeBuilder({ page }).include('dialog').analyze()
  expect(a11y.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([])

  await dialog.getByLabel('Bank name (optional)').fill('Coop Bank')
  await dialog.getByRole('button', { name: 'Use these columns' }).click()
  await expect(page.getByTestId('hero-spent')).toHaveText(expectedSpendB())

  // 3. The inspector explains how the file was read.
  await nav(page, /^Statements/)
  await expect(page.locator('main')).toContainText('Coop Bank')
  await page.getByRole('button', { name: 'Inspect coop-bank.csv' }).click()
  const sheet = page.getByRole('dialog', { name: /Inspect/ })
  await expect(sheet).toContainText('Your saved layout')
  await expect(sheet).toContainText('100% check out')
  await page.screenshot({ path: 'test-results/screens/inspector.png' })
  await page.keyboard.press('Escape')

  expect(requests.map((r) => r.url())).toEqual([])
  expect(await violations(page)).toEqual([])
})

test('a taught layout is remembered (when the user opts in) and applied automatically', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('file-input').setInputFiles([unknownLayoutCsv()])
  await page.getByRole('button', { name: 'Fix columns' }).click()
  const dialog = page.getByRole('dialog', { name: /Fix columns/ })
  await dialog.getByLabel('Bank name (optional)').fill('Coop Bank')
  await dialog.getByRole('button', { name: 'Use these columns' }).click()
  await nav(page, /^Privacy/)
  await page.getByLabel('Remember my category rules on this device').check()

  // Saved: column titles and roles only, nothing from the statement rows.
  const stored = await page.evaluate(() => localStorage.getItem('kharchalens.rules.v1') ?? '')
  expect(JSON.parse(stored).customLayouts).toHaveLength(1)
  expect(stored).not.toMatch(/RAHUL|ZOMATO|UPI|8765|\d{1,3},\d{3}/)

  await page.reload()
  await page.getByTestId('file-input').setInputFiles([unknownLayoutCsv()])
  await expect(page.getByTestId('hero-spent')).toHaveText(expectedSpendB(), { timeout: 20_000 })
  await expect(page.getByText('Couldn’t read')).toHaveCount(0)
})
