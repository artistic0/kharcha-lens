/** Write the synthetic statements to fixtures/synthetic/ for trying the app by hand. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSample } from '../../src/sample/synth'
import { renderCsv, renderHdfcPdf, renderIciciXlsx, renderSbiPdf, renderScannedPdf } from './render'

const out = join(process.cwd(), 'fixtures', 'synthetic')
mkdirSync(out, { recursive: true })
const { A, B } = buildSample()

const files: [string, Uint8Array | string][] = [
  ['hdfc-style-salary-account.pdf', await renderHdfcPdf(A)],
  ['hdfc-style-jul-aug.pdf', await renderHdfcPdf(A, { to: '2026-08-31' })],
  ['hdfc-style-aug-sep.pdf', await renderHdfcPdf(A, { from: '2026-08-01' })],
  ['hdfc-style-locked-password-rahu0101.pdf', await renderHdfcPdf(A, { password: 'rahu0101' })],
  ['sbi-style-spending-account.pdf', await renderSbiPdf(B)],
  ['icici-style-spending-account.xlsx', renderIciciXlsx(B)],
  ['generic-spending-account.csv', renderCsv(B)],
  ['scanned-statement.pdf', await renderScannedPdf()],
]
for (const [name, data] of files) writeFileSync(join(out, name), data)
console.log(`Wrote ${files.length} files to ${out}`)
