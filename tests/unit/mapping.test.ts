/**
 * Statements whose column titles the reader doesn't know: the column wizard's guesses,
 * user mappings, saved layouts, and the per-page header furniture of real PDFs.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { bestMapping, checkMapping, parseGridStatement, parseMapped, parsePdfStatement, StatementError, toCustomLayout } from '../../src/engine/parse'
import { extractPdfText, type PdfJsLike } from '../../src/engine/pdfText'
import { csvToGrid } from '../../src/engine/sheet'
import type { ParseResult } from '../../src/engine/types'
import { buildSample, type SynthAccount } from '../../src/sample/synth'
import { renderHdfcPdf } from '../../tools/synth/render'

const lib = pdfjs as unknown as PdfJsLike
const { A, B } = buildSample()
const num = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amt = (p: number) => num.format(p / 100)
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const q = (s: string) => `"${s.replace(/"/g, '""')}"`

const UNKNOWN_TITLES = ['When', 'Details', 'Ref', 'Val', 'Out', 'In', 'Left']

function expectAccount(res: ParseResult, acct: SynthAccount) {
  expect(res.txns.map((t) => `${t.date} ${t.debit}/${t.credit} ${t.balance}`)).toEqual(acct.txns.map((t) => `${t.date} ${t.debit}/${t.credit} ${t.balance}`))
  expect(res.statement.reconcileRate).toBe(1)
}

function catchStatementError(fn: () => unknown): StatementError {
  try {
    fn()
  } catch (e) {
    if (e instanceof StatementError) return e
    throw e
  }
  throw new Error('expected a StatementError')
}

/** CSV with column titles no bank uses, and a few account-info rows on top. */
function unknownCsv(acct: SynthAccount, extraMetaRows = 0) {
  return [
    ...Array.from({ length: extraMetaRows }, (_, i) => `Note ${i + 1},`),
    `Holder,${q(acct.holder)}`,
    `Acct,${q(`XXXX${acct.last4}`)}`,
    '',
    'When,What,Out,In,Left',
    ...acct.txns.map((t) => [ddmmyyyy(t.date), q(t.narration), t.debit ? q(amt(t.debit)) : '', t.credit ? q(amt(t.credit)) : '', q(amt(t.balance))].join(',')),
  ].join('\n')
}

/** One Amount column plus a separate Dr/Cr column, unknown titles. */
function amountSideCsv(acct: SynthAccount) {
  return [
    'Posted,Info,Sum,Side,Running',
    ...acct.txns.map((t) => [ddmmyyyy(t.date), q(t.narration), q(amt(t.debit || t.credit)), t.debit ? 'DR' : 'CR', q(amt(t.balance))].join(',')),
  ].join('\n')
}

describe('unknown column titles', () => {
  it('PDF: reader stops, wizard guesses every column right', async () => {
    const pages = await extractPdfText(lib, await renderHdfcPdf(A, { titles: UNKNOWN_TITLES }))
    const err = catchStatementError(() => parsePdfStatement('x.pdf', pages, 'P'))
    expect(err.code).toBe('NO_TABLE')
    const view = err.view!
    expect(view.kind).toBe('pdf')
    const mapping = bestMapping(view)
    expect(mapping.roles.filter(Boolean)).toEqual(expect.arrayContaining(['date', 'narration', 'debit', 'credit', 'balance']))
    expectAccount(parseMapped('x.pdf', view, mapping, 'P'), A)
  })

  it('CSV: guesses the table start, dates, narration and debit/credit/balance', () => {
    const err = catchStatementError(() => parseGridStatement('x.csv', csvToGrid(unknownCsv(B)), 'C'))
    const view = err.view!
    expect(view.rows[view.headerRow!]).toEqual(['When', 'What', 'Out', 'In', 'Left'])
    const mapping = bestMapping(view)
    expect(mapping.roles).toEqual(['date', 'narration', 'debit', 'credit', 'balance'])
    expectAccount(parseMapped('x.csv', view, mapping, 'C'), B)
  })

  it('CSV with one Amount column and a Dr/Cr column', () => {
    const err = catchStatementError(() => parseGridStatement('x.csv', csvToGrid(amountSideCsv(B)), 'S'))
    const mapping = bestMapping(err.view!)
    expect(mapping.roles).toEqual(['date', 'narration', 'amount', 'drcr', 'balance'])
    expectAccount(parseMapped('x.csv', err.view!, mapping, 'S'), B)
  })

  it('a wrong mapping shows up as balances that do not check out', () => {
    const err = catchStatementError(() => parseGridStatement('x.csv', csvToGrid(unknownCsv(B)), 'C'))
    const swapped = { headerRow: err.view!.headerRow, roles: ['date', 'narration', 'credit', 'debit', 'balance'] as const }
    const check = checkMapping(err.view!, { ...swapped, roles: [...swapped.roles] })
    expect(check.ok).toBe(true)
    expect(check.rate).toBeLessThan(0.5)
  })

  it('bestMapping swaps debit/credit when the bank orders them the other way', () => {
    const flipped = [
      'When,What,In,Out,Left',
      ...B.txns.map((t) => [ddmmyyyy(t.date), q(t.narration), t.credit ? q(amt(t.credit)) : '', t.debit ? q(amt(t.debit)) : '', q(amt(t.balance))].join(',')),
    ].join('\n')
    const err = catchStatementError(() => parseGridStatement('x.csv', csvToGrid(flipped), 'F'))
    const mapping = bestMapping(err.view!)
    expect(mapping.roles).toEqual(['date', 'narration', 'credit', 'debit', 'balance'])
    expect(checkMapping(err.view!, mapping).rate).toBe(1)
  })
})

describe('saved layouts', () => {
  it('a sheet layout taught once is applied automatically next time, even if the table moved down', () => {
    const err = catchStatementError(() => parseGridStatement('jul.csv', csvToGrid(unknownCsv(B)), 'C1'))
    const layout = toCustomLayout(err.view!, bestMapping(err.view!), 'Coop Bank')
    // Only column titles, never values from rows.
    expect(layout.fingerprint).not.toMatch(/\d/)
    expect(JSON.stringify(layout)).not.toMatch(/RAHUL|ZOMATO|UPI|,\d{2,}/)
    const next = parseGridStatement('aug.csv', csvToGrid(unknownCsv(B, 3)), 'C2', [layout])
    expect(next.statement.bankName).toBe('Coop Bank')
    expectAccount(next, B)
  })

  it('a PDF layout taught once is applied to another month of the same bank', async () => {
    const jul = await extractPdfText(lib, await renderHdfcPdf(A, { titles: UNKNOWN_TITLES, to: '2026-08-31' }))
    const err = catchStatementError(() => parsePdfStatement('a.pdf', jul, 'P1'))
    const layout = toCustomLayout(err.view!, bestMapping(err.view!), 'Coop Bank')
    expect(layout.fingerprint).not.toMatch(/\d/)
    const sep = await extractPdfText(lib, await renderHdfcPdf(A, { titles: UNKNOWN_TITLES, from: '2026-08-01' }))
    const res = parsePdfStatement('b.pdf', sep, 'P2', [layout])
    expect(res.statement.bankName).toBe('Coop Bank')
    expect(res.statement.reconcileRate).toBe(1)
    expect(res.txns.length).toBe(A.txns.filter((t) => t.date >= '2026-08-01').length)
  })
})

describe('real-world PDF furniture', () => {
  it('bank header repeated at the top of every page is not glued onto narrations', async () => {
    const pages = await extractPdfText(lib, await renderHdfcPdf(A, { repeatMeta: true }))
    expect(pages.length).toBeGreaterThan(1)
    const res = parsePdfStatement('a.pdf', pages, 'R')
    expectAccount(res, A)
    res.txns.forEach((t, i) => expect(t.narration, A.txns[i].tag).toBe(A.txns[i].narration))
  })

  it('every parse keeps a grid view with the detected roles for the inspector', async () => {
    const res = parsePdfStatement('a.pdf', await extractPdfText(lib, await renderHdfcPdf(A)), 'V')
    expect(res.view?.roles).toEqual(expect.arrayContaining(['date', 'narration', 'debit', 'credit', 'balance']))
  })
})
