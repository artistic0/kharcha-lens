/**
 * Synthetic statements in the column layouts of more Indian banks (built from their
 * published column titles and date styles). Test tooling only; never shipped.
 */
import type { SynthAccount, SynthTxn } from '../../src/sample/synth'
import { renderTablePdf } from './render'

type Kind = 'serial' | 'date' | 'valueDate' | 'narration' | 'ref' | 'branch' | 'debit' | 'credit' | 'balance'

interface BankLayout {
  meta: (a: SynthAccount) => string[]
  columns: [title: string, kind: Kind][]
  date: (iso: string) => string
  balanceSuffix?: string
  landscape?: boolean
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const num = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amt = (p: number) => num.format(p / 100)
const dmy = (sep: string) => (iso: string) => `${iso.slice(8, 10)}${sep}${iso.slice(5, 7)}${sep}${iso.slice(0, 4)}`
const dMonY = (yy: boolean) => (iso: string) => `${iso.slice(8, 10)}-${MON[Number(iso.slice(5, 7)) - 1]}-${yy ? iso.slice(2, 4) : iso.slice(0, 4)}`

export const BANK_LAYOUTS: Record<string, BankLayout> = {
  axis: {
    meta: (a) => ['AXIS BANK', `Customer Name : ${a.holderTitle} ${a.holder}`, `Account No : 9120100123${a.last4}`, 'IFSC Code : UTIB0000123'],
    columns: [['Tran Date', 'date'], ['Chq No', 'ref'], ['Particulars', 'narration'], ['Debit', 'debit'], ['Credit', 'credit'], ['Balance', 'balance'], ['Init. Br', 'branch']],
    date: dmy('-'),
  },
  kotak: {
    meta: (a) => ['Kotak Mahindra Bank', `Account Name : ${a.holder}`, `Account Number : 123456${a.last4}`, 'IFSC Code : KKBK0000123'],
    columns: [['Date', 'date'], ['Narration', 'narration'], ['Chq/Ref No', 'ref'], ['Withdrawal (Dr)', 'debit'], ['Deposit (Cr)', 'credit'], ['Balance', 'balance']],
    date: dmy('-'),
  },
  bob: {
    meta: (a) => ['BANK OF BARODA', `Name : ${a.holder}`, `A/C No : 2345010000${a.last4}`, 'IFSC : BARB0MGROAD'],
    columns: [['TRAN DATE', 'date'], ['VALUE DATE', 'valueDate'], ['NARRATION', 'narration'], ['CHQ.NO.', 'ref'], ['WITHDRAWAL(DR)', 'debit'], ['DEPOSIT(CR)', 'credit'], ['BALANCE(INR)', 'balance']],
    date: dmy('-'),
  },
  pnb: {
    meta: (a) => ['PUNJAB NATIONAL BANK', `Customer Name : ${a.holderTitle} ${a.holder}`, `Account Number : 01234567890${a.last4}`, 'IFSC : PUNB0012300'],
    columns: [['Txn No.', 'serial'], ['Txn Date', 'date'], ['Description', 'narration'], ['Branch Name', 'branch'], ['Cheque No.', 'ref'], ['Dr Amount', 'debit'], ['Cr Amount', 'credit'], ['Balance', 'balance'], ['Value Date', 'valueDate']],
    date: dmy('/'),
    balanceSuffix: ' Cr',
    landscape: true,
  },
  canara: {
    meta: (a) => ['CANARA BANK', `Account Holder Name : ${a.holder}`, `Account Number : 1101000${a.last4}`, 'IFSC Code : CNRB0001234'],
    columns: [['Txn Date', 'date'], ['Value Date', 'valueDate'], ['Cheque No.', 'ref'], ['Description', 'narration'], ['Branch Code', 'branch'], ['Debit', 'debit'], ['Credit', 'credit'], ['Balance', 'balance']],
    date: dMonY(false),
  },
  idfc: {
    meta: (a) => ['IDFC FIRST Bank', `Customer Name : ${a.holder}`, `Account Number : 100${a.last4}`, 'IFSC : IDFB0080123'],
    columns: [['Transaction Date', 'date'], ['Value Date', 'valueDate'], ['Particulars', 'narration'], ['Cheque No', 'ref'], ['Debit', 'debit'], ['Credit', 'credit'], ['Balance', 'balance']],
    date: dMonY(true),
  },
}

const WIDTH: Record<Kind, number> = { serial: 22, date: 50, valueDate: 50, narration: 0, ref: 60, branch: 42, debit: 54, credit: 54, balance: 66 }
const RIGHT: Kind[] = ['debit', 'credit', 'balance']
// Wide enough for the column title (bold 7.5pt is roughly 4.2pt per character).
const widthOf = (title: string, kind: Kind) => Math.max(WIDTH[kind], Math.ceil(title.length * 4.2))

export function renderBankPdf(acct: SynthAccount, bank: keyof typeof BANK_LAYOUTS) {
  const L = BANK_LAYOUTS[bank]
  const gap = 8
  const fixed = L.columns.reduce((n, [t, k]) => n + (k === 'narration' ? 0 : widthOf(t, k)), 0) + gap * (L.columns.length - 1)
  const right = L.landscape ? 812 : 565
  const narrW = right - 30 - fixed
  let left = 30
  const cols = L.columns.map(([title, kind]) => {
    const w = kind === 'narration' ? narrW : widthOf(title, kind)
    const col = { title, x: RIGHT.includes(kind) ? left + w : left, align: (RIGHT.includes(kind) ? 'right' : 'left') as 'left' | 'right' }
    left += w + gap
    return col
  })
  const cell = (t: SynthTxn, kind: Kind, i: number): string => {
    switch (kind) {
      case 'serial':
        return String(i + 1)
      case 'date':
      case 'valueDate':
        return L.date(t.date)
      case 'narration':
        return t.narration
      case 'ref':
        return t.ref.slice(-10)
      case 'branch':
        return '1234'
      case 'debit':
        return t.debit ? amt(t.debit) : ''
      case 'credit':
        return t.credit ? amt(t.credit) : ''
      case 'balance':
        return amt(t.balance) + (L.balanceSuffix ?? '')
    }
  }
  const index = new Map(acct.txns.map((t, i) => [t, i]))
  return renderTablePdf(acct.txns, {
    meta: L.meta(acct),
    cols,
    narrationCol: L.columns.findIndex(([, k]) => k === 'narration'),
    narrationWidth: narrW - 4,
    cells: (t) => L.columns.map(([, k]) => cell(t, k, index.get(t)!)),
    footer: '** This is a computer generated statement **',
    repeatMeta: true,
    landscape: L.landscape,
  })
}
