/**
 * End-to-end engine tests: render the synthetic accounts as bank-like PDF / XLSX / CSV,
 * parse them back, and compare against the known answers.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { compare, kpis, spendByCategory } from '../../src/engine/aggregate'
import { analyze } from '../../src/engine/analyze'
import { monthKey } from '../../src/engine/dates'
import { mergeResults } from '../../src/engine/merge'
import { parseGridStatement, parsePdfStatement, StatementError } from '../../src/engine/parse'
import { extractPdfText, PdfPasswordError, type PdfJsLike } from '../../src/engine/pdfText'
import { csvToGrid, workbookToGrids } from '../../src/engine/sheet'
import { emptyRules, type ParseResult } from '../../src/engine/types'
import { buildSample, type SynthAccount } from '../../src/sample/synth'
import { renderCsv, renderHdfcPdf, renderIciciXlsx, renderSbiPdf, renderScannedPdf } from '../../tools/synth/render'

const lib = pdfjs as unknown as PdfJsLike
const sample = buildSample()

async function pdfResult(bytes: Uint8Array, name: string, id: string, password?: string) {
  const pages = await extractPdfText(lib, bytes, password)
  return parsePdfStatement(name, pages, id)
}

function expectMatches(result: ParseResult, acct: SynthAccount, opts: { narration?: boolean } = {}) {
  const got = result.txns
  expect(got.map((t) => `${t.date} ${t.debit}/${t.credit} ${t.balance}`)).toEqual(
    acct.txns.map((t) => `${t.date} ${t.debit}/${t.credit} ${t.balance}`),
  )
  if (opts.narration !== false) {
    got.forEach((t, i) => expect(t.narration, acct.txns[i].tag).toBe(acct.txns[i].narration))
  }
  expect(result.statement.reconcileRate).toBe(1)
}

let hdfc: ParseResult
let icici: ParseResult

beforeAll(async () => {
  hdfc = await pdfResult(await renderHdfcPdf(sample.A), 'a.pdf', 'A')
  icici = parseGridStatement('b.xlsx', workbookToGrids(renderIciciXlsx(sample.B))[0], 'B')
})

describe('parsing', () => {
  it('HDFC-style PDF: every row, wrapped narrations, balances', () => {
    expect(hdfc.statement.bank).toBe('hdfc')
    expect(hdfc.statement.holderName).toBe('RAHUL MEHTA')
    expect(hdfc.statement.accountLast4).toBe('4321')
    expectMatches(hdfc, sample.A)
  })

  it('ICICI-style XLSX with metadata rows above the table', () => {
    expect(icici.statement.bank).toBe('icici')
    expect(icici.statement.holderName).toBe('RAHUL MEHTA')
    expect(icici.statement.accountLast4).toBe('8765')
    expectMatches(icici, sample.B)
  })

  it('SBI-style PDF with "1 Jul 2026" dates', async () => {
    const sbi = await pdfResult(await renderSbiPdf(sample.B), 'b.pdf', 'B2')
    expect(sbi.statement.bank).toBe('sbi')
    expect(sbi.statement.holderName).toBe('RAHUL MEHTA')
    expect(sbi.statement.accountLast4).toBe('8765')
    expectMatches(sbi, sample.B, { narration: false })
  })

  it('CSV with Amount + Dr/Cr column, newest first', () => {
    const csv = parseGridStatement('b.csv', csvToGrid(renderCsv(sample.B)), 'B3')
    expectMatches(csv, sample.B)
  })

  it('password-protected PDF', async () => {
    const bytes = await renderHdfcPdf(sample.A, { password: 'rahu0101' })
    await expect(extractPdfText(lib, bytes.slice())).rejects.toBeInstanceOf(PdfPasswordError)
    await expect(extractPdfText(lib, bytes.slice(), 'wrong')).rejects.toMatchObject({ incorrect: true })
    const ok = await pdfResult(bytes.slice(), 'a.pdf', 'A9', 'rahu0101')
    expect(ok.txns).toHaveLength(sample.A.txns.length)
  })

  it('scanned PDF is rejected with a clear error', async () => {
    const bytes = await renderScannedPdf()
    await expect(pdfResult(bytes, 's.pdf', 'S')).rejects.toMatchObject({ code: 'SCANNED' })
  })

  it('unknown layout gives an anonymized layout to share', () => {
    try {
      parseGridStatement('x.csv', [['Name', 'City'], ['Rahul', 'Pune']], 'X')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(StatementError)
      expect((e as StatementError).anonymizedLayout).toBe('Aaaa | Aaaa\nAaaaa | Aaaa')
    }
  })

  it('overlapping statements of one account are de-duplicated', async () => {
    const julAug = await pdfResult(await renderHdfcPdf(sample.A, { to: '2026-08-31' }), 'a1.pdf', 'A1')
    const augSep = await pdfResult(await renderHdfcPdf(sample.A, { from: '2026-08-01' }), 'a2.pdf', 'A2')
    const extra = await pdfResult(await renderHdfcPdf(sample.A, { from: '2026-08-01', to: '2026-08-31' }), 'a3.pdf', 'A3')
    const merged = mergeResults([julAug, augSep, extra])
    expect(merged.txns).toHaveLength(sample.A.txns.length)
    expect(merged.duplicates).toBeGreaterThan(0)
  })
})

describe('analysis on two accounts', () => {
  const run = () => {
    const merged = mergeResults([hdfc, icici])
    return { merged, analysis: analyze(merged.txns, merged.statements, emptyRules()) }
  }

  it('categorizes every transaction as expected', () => {
    const { analysis } = run()
    const expected = new Map(
      [...sample.A.txns.map((t, i) => [`A:${i + 1}`, t] as const), ...sample.B.txns.map((t, i) => [`B:${i + 1}`, t] as const)],
    )
    const wrong = analysis.txns
      .filter((t) => expected.get(t.id)!.expect !== t.category)
      .map((t) => `${expected.get(t.id)!.tag}: expected ${expected.get(t.id)!.expect}, got ${t.category} (${t.categoryWhy})`)
    expect(wrong).toEqual([])
  })

  it('self-transfers are excluded, look-alikes are not', () => {
    const { analysis } = run()
    const self = analysis.txns.filter((t) => t.category === 'self')
    expect(self).toHaveLength(4)
    const friend = analysis.txns.find((t) => t.narration.includes('RAHUL KUMAR'))!
    expect(friend.category).toBe('transfers')
    const gift = analysis.txns.find((t) => t.narration.includes('PRIYA NAIR'))!
    expect(gift.self).toBeUndefined()
  })

  it('totals add up and refunds net against shopping', () => {
    const { analysis } = run()
    const all = [...sample.A.txns, ...sample.B.txns]
    const spendCats = new Set(['food', 'groceries', 'rent', 'bills', 'shopping', 'travel', 'subscriptions', 'health', 'education', 'emi', 'insurance', 'cardbill', 'cash', 'transfers', 'fees', 'misc'])
    const expectedSpend =
      all.filter((t) => spendCats.has(t.expect)).reduce((n, t) => n + t.debit, 0) -
      all.filter((t) => t.expect === 'refunds').reduce((n, t) => n + t.credit, 0)
    const k = kpis(analysis.txns)
    expect(k.spend).toBe(expectedSpend)
    expect(k.income).toBe(all.filter((t) => ['salary', 'interest', 'income_other'].includes(t.expect)).reduce((n, t) => n + t.credit, 0))
    const shopping = spendByCategory(analysis.txns).find((r) => r.category === 'shopping')!
    expect(shopping.amount).toBe(179900) // Amazon 2,499 refunded, Myntra 1,799 stays
  })

  it('finds recurring payments with price changes and converted trials', () => {
    const { analysis } = run()
    const byName = new Map(analysis.recurring.map((r) => [r.name, r]))
    const netflix = byName.get('Netflix')!
    expect(netflix.cadence).toBe('monthly')
    expect(netflix.priceChange).toEqual({ from: 49900, to: 64900, date: '2026-09-10' })
    expect(netflix.typical).toBe(64900)
    const spotify = byName.get('Spotify')!
    expect(spotify.trialConverted).toEqual({ amount: 100, date: '2026-07-12' })
    expect(spotify.typical).toBe(11900)
    expect(byName.get('Bajaj Finance')?.confidence).toBe('high')
    expect(byName.get('BESCOM electricity')?.variableAmount).toBe(true)
    const rent = analysis.recurring.find((r) => r.category === 'rent')!
    expect(rent.typical).toBe(1800000)
    // Food orders are frequent but not a subscription.
    expect(byName.has('Swiggy')).toBe(false)
    expect(byName.has('Uber')).toBe(false)
  })

  it('compares two months by category', () => {
    const { analysis } = run()
    const jul = analysis.txns.filter((t) => monthKey(t.date) === '2026-07')
    const sep = analysis.txns.filter((t) => monthKey(t.date) === '2026-09')
    const rows = compare(jul, sep)
    const subs = rows.find((r) => r.category === 'subscriptions')!
    // Jul: Netflix 499 + Spotify 1 + Apple 179; Sep: 649 + 119 + 179
    expect(subs.a).toBe(67900)
    expect(subs.b).toBe(94700)
    expect(subs.delta).toBe(26800)
    expect(subs.pct).toBeCloseTo(268 / 679, 5)
  })

  it('user payee rules re-categorize every payment to that payee', () => {
    const merged = mergeResults([hdfc, icici])
    const first = analyze(merged.txns, merged.statements, emptyRules())
    const kirana = first.txns.find((t) => t.narration.includes('SHARMA GENERAL STORE'))!
    const rules = { ...emptyRules(), payeeCategory: { [kirana.payeeKey]: 'food' as const } }
    const second = analyze(merged.txns, merged.statements, rules)
    const all = second.txns.filter((t) => t.payeeKey === kirana.payeeKey)
    expect(all.length).toBe(6)
    expect(all.every((t) => t.category === 'food' && t.categorySource === 'user')).toBe(true)
  })

  it('"not self" overrides a self match', () => {
    const merged = mergeResults([hdfc, icici])
    const first = analyze(merged.txns, merged.statements, emptyRules())
    const selfUpi = first.txns.find((t) => t.narration.startsWith('UPI-R MEHTA'))!
    expect(selfUpi.category).toBe('self')
    const second = analyze(merged.txns, merged.statements, { ...emptyRules(), notSelfPayees: [selfUpi.payeeKey] })
    expect(second.txns.find((t) => t.id === selfUpi.id)!.category).not.toBe('self')
  })
})
