/**
 * Render the synthetic accounts as bank-like files: an HDFC-style PDF, an SBI-style PDF,
 * an ICICI-style XLSX and a generic Dr/Cr CSV. Test tooling only; never shipped.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib'
import * as XLSX from 'xlsx'
import type { SynthAccount, SynthTxn } from '../../src/sample/synth'

const num = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amt = (paise: number) => num.format(paise / 100)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ddmmyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`
const ddmmyyyy = (iso: string, sep = '/') => `${iso.slice(8, 10)}${sep}${iso.slice(5, 7)}${sep}${iso.slice(0, 4)}`
const dMonY = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const parts = text.split(/(?<=[-/ ])/)
  const lines: string[] = []
  let cur = ''
  for (const p of parts) {
    if (font.widthOfTextAtSize(cur + p, size) <= max) {
      cur += p
      continue
    }
    if (cur) lines.push(cur.trim())
    cur = p
    while (font.widthOfTextAtSize(cur, size) > max) {
      let cut = cur.length - 1
      while (cut > 1 && font.widthOfTextAtSize(cur.slice(0, cut), size) > max) cut--
      lines.push(cur.slice(0, cut))
      cur = cur.slice(cut)
    }
  }
  if (cur.trim()) lines.push(cur.trim())
  return lines
}

interface Col {
  title: string
  x: number
  align: 'left' | 'right'
}

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, align: 'left' | 'right' = 'left') {
  const w = font.widthOfTextAtSize(s, size)
  page.drawText(s, { x: align === 'right' ? x - w : x, y, size, font, color: rgb(0.1, 0.1, 0.1) })
}

interface TableSpec {
  cols: Col[]
  narrationCol: number
  narrationWidth: number
  cells: (t: SynthTxn) => string[]
  meta: string[]
  footer?: string
  summary?: string[]
  /** Print the bank's header block on every page, like many real statements do. */
  repeatMeta?: boolean
  /** Landscape A4, as banks use for wide tables. */
  landscape?: boolean
}

export async function renderTablePdf(txns: SynthTxn[], spec: TableSpec, password?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = 7.5
  const lh = 9.5
  const pageSize: [number, number] = spec.landscape ? [842, 595] : [595, 842]
  const top = pageSize[1] - 42
  let page = doc.addPage(pageSize)
  let y = top
  let pageNo = 1

  const drawMeta = () => {
    for (const [i, m] of spec.meta.entries()) {
      text(page, m, 30, y, i === 0 ? bold : font, i === 0 ? 11 : 8.5)
      y -= i === 0 ? 16 : 11
    }
    y -= 8
  }
  drawMeta()
  const header = () => {
    for (const c of spec.cols) text(page, c.title, c.x, y, bold, size, c.align)
    y -= lh + 3
  }
  const footer = () => {
    text(page, `Page No .: ${pageNo}`, 500, 30, font, 7)
    if (spec.footer) text(page, spec.footer, 30, 30, font, 6.5)
  }
  header()
  for (const t of txns) {
    const cells = spec.cells(t)
    const narr = wrap(cells[spec.narrationCol], font, size, spec.narrationWidth)
    const need = narr.length * lh + 2
    if (y - need < 50) {
      footer()
      page = doc.addPage(pageSize)
      pageNo++
      y = top
      if (spec.repeatMeta) drawMeta()
      header()
    }
    spec.cols.forEach((c, ci) => {
      if (ci === spec.narrationCol) return
      if (cells[ci]) text(page, cells[ci], c.x, y, font, size, c.align)
    })
    narr.forEach((line, li) => text(page, line, spec.cols[spec.narrationCol].x, y - li * lh, font, size))
    y -= need
  }
  if (spec.summary) {
    y -= 10
    if (y < 80) {
      footer()
      page = doc.addPage(pageSize)
      pageNo++
      y = top
    }
    for (const s of spec.summary) {
      text(page, s, 30, y, font, 8)
      y -= 11
    }
  }
  footer()
  if (password) doc.encrypt({ userPassword: password, ownerPassword: `${password}-owner` })
  return doc.save({ useObjectStreams: false })
}

export function slice(acct: SynthAccount, from?: string, to?: string): SynthTxn[] {
  return acct.txns.filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
}

/** HDFC-like: Date | Narration | Chq./Ref.No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance */
export function renderHdfcPdf(
  acct: SynthAccount,
  opts: { from?: string; to?: string; password?: string; titles?: string[]; bankLine?: string; repeatMeta?: boolean } = {},
) {
  const txns = slice(acct, opts.from, opts.to)
  const debits = txns.reduce((n, t) => n + t.debit, 0)
  const credits = txns.reduce((n, t) => n + t.credit, 0)
  return renderTablePdf(
    txns,
    {
      meta: [
        opts.bankLine ?? 'HDFC BANK Ltd.',
        `${acct.holderTitle} ${acct.holder}`,
        '12 MG ROAD, BANGALORE 560001',
        `Account No : ${acct.accountNumber}        IFSC : HDFC0000123`,
        `Statement From : ${ddmmyyyy(txns[0].date)} To : ${ddmmyyyy(txns[txns.length - 1].date)}`,
      ],
      cols: [
        { title: 'Date', x: 30, align: 'left' },
        { title: 'Narration', x: 72, align: 'left' },
        { title: 'Chq./Ref.No.', x: 268, align: 'left' },
        { title: 'Value Dt', x: 336, align: 'left' },
        { title: 'Withdrawal Amt.', x: 440, align: 'right' },
        { title: 'Deposit Amt.', x: 500, align: 'right' },
        { title: 'Closing Balance', x: 565, align: 'right' },
      ].map((c, i) => ({ ...c, title: opts.titles?.[i] ?? c.title })),
      repeatMeta: opts.repeatMeta,
      narrationCol: 1,
      narrationWidth: 188,
      cells: (t) => [
        ddmmyy(t.date),
        t.narration,
        t.ref.slice(-12).padStart(16, '0'),
        ddmmyy(t.date),
        t.debit ? amt(t.debit) : '',
        t.credit ? amt(t.credit) : '',
        amt(t.balance),
      ],
      footer: 'HDFC BANK LIMITED  *Closing balance includes funds earmarked for hold and uncleared funds',
      summary: [
        'STATEMENT SUMMARY :-',
        'Opening Balance    Dr Count    Cr Count    Debits    Credits    Closing Bal',
        `${amt(txns[0].balance + txns[0].debit - txns[0].credit)}    ${txns.filter((t) => t.debit).length}    ${txns.filter((t) => t.credit).length}    ${amt(debits)}    ${amt(credits)}    ${amt(txns[txns.length - 1].balance)}`,
      ],
    },
    opts.password,
  )
}

/** SBI-like: Txn Date | Value Date | Description | Ref No./Cheque No. | Debit | Credit | Balance */
export function renderSbiPdf(acct: SynthAccount) {
  return renderTablePdf(acct.txns, {
    meta: [
      'STATE BANK OF INDIA',
      `Account Name : ${acct.holderTitle} ${acct.holder}`,
      'Address : 44 RESIDENCY ROAD BANGALORE',
      `Account Number : ${acct.accountNumber}`,
      'IFS Code : SBIN0004321',
      `Balance as on ${dMonY(acct.txns[0].date)} : ${amt(acct.opening)}`,
    ],
    cols: [
      { title: 'Txn Date', x: 30, align: 'left' },
      { title: 'Value Date', x: 82, align: 'left' },
      { title: 'Description', x: 134, align: 'left' },
      { title: 'Ref No./Cheque No.', x: 318, align: 'left' },
      { title: 'Debit', x: 455, align: 'right' },
      { title: 'Credit', x: 510, align: 'right' },
      { title: 'Balance', x: 565, align: 'right' },
    ],
    narrationCol: 2,
    narrationWidth: 175,
    cells: (t) => [
      dMonY(t.date),
      dMonY(t.date),
      `${t.debit ? 'TO TRANSFER-' : 'BY TRANSFER-'}${t.narration}`,
      t.ref,
      t.debit ? amt(t.debit) : '',
      t.credit ? amt(t.credit) : '',
      amt(t.balance),
    ],
    footer: '**This is a computer generated statement and does not require a signature.',
  })
}

/** ICICI-like detailed statement as XLSX, with metadata rows above the table. */
export function renderIciciXlsx(acct: SynthAccount): Uint8Array {
  const rows: (string | number)[][] = [
    [],
    ['', 'DETAILED STATEMENT'],
    ['', 'ICICI Bank Limited'],
    [],
    ['', 'Account Name', acct.holder],
    ['', 'Account Number', `XXXXXXXX${acct.last4}`],
    ['', 'Transaction Period', `${ddmmyyyy(acct.txns[0].date)} to ${ddmmyyyy(acct.txns[acct.txns.length - 1].date)}`],
    [],
    ['', 'S No.', 'Value Date', 'Transaction Date', 'Cheque Number', 'Transaction Remarks', 'Withdrawal Amount (INR )', 'Deposit Amount (INR )', 'Balance (INR )'],
    ...acct.txns.map((t, i) => [
      '',
      i + 1,
      ddmmyyyy(t.date),
      ddmmyyyy(t.date),
      '',
      t.narration,
      t.debit / 100,
      t.credit / 100,
      t.balance / 100,
    ]),
    [],
    ['', 'Legends Used in Account Statement'],
    ['', 'INF - Internet Fund Transfer'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  for (const addr of Object.keys(ws)) {
    const cell = ws[addr] as XLSX.CellObject
    if (cell && typeof cell === 'object' && cell.t === 'n' && /^[GHI]/.test(addr)) cell.z = '#,##0.00'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'OpTransactionHistory')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

/** Generic CSV with a single Amount column and a Dr/Cr flag, newest first. */
export function renderCsv(acct: SynthAccount): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = [
    'Account Name:,' + q(acct.holder),
    'Account Number:,' + q(`XXXXXXXX${acct.last4}`),
    '',
    'Tran Date,Particulars,Chq No,Dr/Cr,Amount,Balance',
    ...acct.txns
      .slice()
      .reverse()
      .map((t) =>
        [ddmmyyyy(t.date, '-'), q(t.narration), '', t.debit ? 'DR' : 'CR', q(amt(t.debit || t.credit)), q(amt(t.balance))].join(','),
      ),
  ]
  return lines.join('\n')
}

/** An image-only page with no text layer, like a scanned statement. */
export async function renderScannedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  for (let i = 0; i < 40; i++) page.drawRectangle({ x: 30, y: 780 - i * 18, width: 535, height: 10, color: rgb(0.85, 0.85, 0.85) })
  return doc.save()
}
