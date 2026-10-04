import type { BrowserContext, Page, Request } from '@playwright/test'
import { buildSample } from '../../src/sample/synth'
import { renderHdfcPdf, renderIciciXlsx, renderScannedPdf } from '../../tools/synth/render'

export const sample = buildSample()

export async function statementFiles() {
  return {
    hdfcPdf: { name: 'hdfc-style.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await renderHdfcPdf(sample.A)) },
    lockedPdf: { name: 'locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await renderHdfcPdf(sample.A, { password: 'rahu0101' })) },
    iciciXlsx: {
      name: 'icici-style.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(renderIciciXlsx(sample.B)),
    },
    scannedPdf: { name: 'scanned.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await renderScannedPdf()) },
  }
}

const SPEND = new Set(['food', 'groceries', 'rent', 'bills', 'shopping', 'travel', 'subscriptions', 'health', 'education', 'emi', 'insurance', 'cardbill', 'cash', 'transfers', 'fees', 'misc'])

/** Expected "Spent" for both sample accounts, formatted like the app. */
export function expectedSpend(): string {
  const all = [...sample.A.txns, ...sample.B.txns]
  const paise =
    all.filter((t) => SPEND.has(t.expect)).reduce((n, t) => n + t.debit, 0) -
    all.filter((t) => t.expect === 'refunds').reduce((n, t) => n + t.credit, 0)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100)
}

/** Wait until the app has loaded everything it will ever load (workers and fonts included). */
export async function openApp(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __cspViolations: string[] }).__cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window as unknown as { __cspViolations: string[] }).__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  await page.goto('/')
  await page.waitForFunction(() => document.body.innerText.includes('Where did my'))
  await page.waitForTimeout(2000)
}

/** Record every request the page or its workers make from now on. */
export function recordRequests(context: BrowserContext): Request[] {
  const seen: Request[] = []
  context.on('request', (r) => seen.push(r))
  return seen
}

export const violations = (page: Page) => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)

/** Go to a section via the sidebar (desktop). */
export const nav = (page: Page, name: RegExp) => page.getByRole('navigation').getByRole('button', { name }).first().click()

/** Recategorize the first transaction matching `search` via the detail sheet. */
export async function recategorize(page: Page, search: string, category: string) {
  await page.getByLabel('Search').fill(search)
  await page.locator('main').getByRole('button', { name: new RegExp(`^${search}`, 'i') }).first().click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: category, exact: true }).click()
  await page.keyboard.press('Escape')
  await sheet.waitFor({ state: 'hidden' })
}

const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** Spending account B as a CSV whose column titles no bank uses. */
export function unknownLayoutCsv() {
  const t = sample.B.txns
  const body = [
    `Holder,${quote(sample.B.holder)}`,
    `Acct,${quote(`XXXX${sample.B.last4}`)}`,
    '',
    'When,What,Out,In,Left',
    ...t.map((x) => [dmy(x.date), quote(x.narration), x.debit ? quote(inr2.format(x.debit / 100)) : '', x.credit ? quote(inr2.format(x.credit / 100)) : '', quote(inr2.format(x.balance / 100))].join(',')),
  ].join('\n')
  return { name: 'coop-bank.csv', mimeType: 'text/csv', buffer: Buffer.from(body) }
}

/** "Spent" for account B alone, formatted like the app. */
export function expectedSpendB(): string {
  const paise = sample.B.txns.filter((t) => SPEND.has(t.expect)).reduce((n, t) => n + t.debit, 0)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100)
}
