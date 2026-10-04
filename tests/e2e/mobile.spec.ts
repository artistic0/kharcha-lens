import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('phone: bottom tabs work and nothing scrolls sideways', async ({ page }) => {
  await openApp(page)
  const noOverflow = async (label: string) => {
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
    expect(sw, `${label} overflows: ${sw} > ${iw}`).toBeLessThanOrEqual(iw)
  }
  await noOverflow('landing')
  await page.screenshot({ path: 'test-results/screens/phone-landing.png', fullPage: true })
  await page.getByRole('button', { name: 'Try sample data' }).click()
  await expect(page.getByRole('heading', { name: 'Where it went' })).toBeVisible()
  await noOverflow('overview')
  await page.screenshot({ path: 'test-results/screens/phone-overview.png', fullPage: true })

  const tabs = page.getByRole('navigation', { name: 'Main' })
  for (const tab of ['Compare', 'Transactions', 'Recurring']) {
    await tabs.getByRole('button', { name: tab }).click()
    await expect(page.locator('main h1')).toBeVisible()
    await noOverflow(tab)
    await page.screenshot({ path: `test-results/screens/phone-${tab.toLowerCase()}.png`, fullPage: true })
  }
  for (const item of ['Statements', 'Self-transfers', 'Privacy']) {
    await tabs.getByRole('button', { name: 'More' }).click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: new RegExp(`^${item}`) }).click()
    await noOverflow(item)
  }
})
