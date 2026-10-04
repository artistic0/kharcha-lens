/** Each beta bank profile reads a statement in that bank's column layout. */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { parsePdfStatement } from '../../src/engine/parse'
import { extractPdfText, type PdfJsLike } from '../../src/engine/pdfText'
import { PROFILE_BY_ID } from '../../src/engine/profiles'
import { buildSample } from '../../src/sample/synth'
import { BANK_LAYOUTS, renderBankPdf } from '../../tools/synth/banks'

const lib = pdfjs as unknown as PdfJsLike
const { A } = buildSample()

describe.each(Object.keys(BANK_LAYOUTS))('%s', (bank) => {
  it('detects the bank, holder and account, and reads every row exactly', async () => {
    const pages = await extractPdfText(lib, await renderBankPdf(A, bank))
    const res = parsePdfStatement(`${bank}.pdf`, pages, bank)
    expect(res.statement.bank).toBe(bank)
    expect(PROFILE_BY_ID[bank].beta).toBe(true)
    expect(res.statement.holderName).toBe('RAHUL MEHTA')
    expect(res.statement.accountLast4).toBe('4321')
    expect(res.statement.reconcileRate).toBe(1)
    expect(res.txns.map((t) => `${t.date} ${t.debit}/${t.credit} ${t.balance}`)).toEqual(A.txns.map((t) => `${t.date} ${t.debit}/${t.credit} ${t.balance}`))
    res.txns.forEach((t, i) => expect(t.narration, `${bank}: ${A.txns[i].tag}`).toBe(A.txns[i].narration))
  })
})
