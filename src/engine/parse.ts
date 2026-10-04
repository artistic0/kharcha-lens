import { parseAmount } from './money'
import { parseNarration } from './narration'
import type { BankProfile } from './profiles'
import { tableFromGrid, tableFromPdf, type RawRow, type TableResult } from './table'
import type { ParseResult, PdfPageText, Statement, Txn } from './types'

export class StatementError extends Error {
  code: 'NO_TABLE' | 'NO_ROWS' | 'SCANNED' | 'PASSWORD' | 'UNSUPPORTED'
  /** Layout with letters/digits masked, safe to share for support. */
  anonymizedLayout?: string
  constructor(code: StatementError['code'], message: string, anonymizedLayout?: string) {
    super(message)
    this.code = code
    this.anonymizedLayout = anonymizedLayout
  }
}

/** Mask every letter and digit so a layout can be shared without the data in it. */
export function anonymize(text: string): string {
  return text.replace(/[A-Z]/g, 'A').replace(/[a-z]/g, 'a').replace(/[0-9]/g, '9')
}

function findFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const line of text.split('\n')) {
    const l = line.trim().toUpperCase()
    for (const r of patterns) {
      const m = l.match(r)
      if (m?.[1]) return m[1].trim()
    }
  }
  return undefined
}

function holderAndAccount(meta: string, profile: BankProfile) {
  const holderRaw = findFirst(meta, profile.holder)
  const holderName = holderRaw
    ?.replace(/\s{2,}.*/, '')
    .replace(/^(MR|MRS|MS|MISS|SHRI|SMT|DR)\.?\s+/, '')
    .trim()
  const acct = findFirst(meta, profile.account)
  const digits = acct?.replace(/[^\d]/g, '')
  const accountLast4 = digits && digits.length >= 4 ? digits.slice(-4) : undefined
  return { holderName: holderName && holderName.length >= 3 ? holderName : undefined, accountLast4 }
}

interface Amounts {
  debit: number
  credit: number
  balance?: number
  unknownSide?: number
}

function readAmounts(r: RawRow): Amounts {
  const bal = parseAmount(r.balance)
  const balance = bal ? (bal.side === 'DR' ? -Math.abs(bal.paise) : bal.paise) : undefined
  const d = parseAmount(r.debit)
  const c = parseAmount(r.credit)
  if (d || c) return { debit: Math.abs(d?.paise ?? 0), credit: Math.abs(c?.paise ?? 0), balance }
  const a = parseAmount(r.amount)
  if (!a) return { debit: 0, credit: 0, balance }
  const flag = (r.drcr ?? '').trim().toUpperCase()
  const side = a.side ?? (/^(DR|D|DEBIT|WITHDRAWAL)/.test(flag) ? 'DR' : /^(CR|C|CREDIT|DEPOSIT)/.test(flag) ? 'CR' : undefined)
  if (side === 'DR') return { debit: Math.abs(a.paise), credit: 0, balance }
  if (side === 'CR') return { debit: 0, credit: Math.abs(a.paise), balance }
  if (a.paise < 0) return { debit: -a.paise, credit: 0, balance }
  return { debit: 0, credit: 0, balance, unknownSide: a.paise }
}

/**
 * Check every row against the running balance (previous - debit + credit = balance),
 * settling debit/credit for single-amount layouts along the way.
 */
export function reconcile(rows: Amounts[], opening?: number): { rate: number | null; failed: number[] } {
  let checkable = 0
  let ok = 0
  const failed: number[] = []
  let prev = opening
  rows.forEach((r, i) => {
    if (r.balance === undefined) {
      prev = undefined
      return
    }
    if (prev !== undefined) {
      if (r.unknownSide !== undefined) {
        if (Math.abs(prev - r.unknownSide - r.balance) <= 1) {
          r.debit = r.unknownSide
          r.unknownSide = undefined
        } else if (Math.abs(prev + r.unknownSide - r.balance) <= 1) {
          r.credit = r.unknownSide
          r.unknownSide = undefined
        }
      }
      checkable++
      if (Math.abs(prev - r.debit + r.credit - r.balance) <= 1) ok++
      else failed.push(i + 1)
    }
    prev = r.balance
  })
  // Rows whose side could not be settled are treated as debits (the safer guess for spend).
  for (const r of rows) {
    if (r.unknownSide !== undefined) {
      r.debit = r.unknownSide
      r.unknownSide = undefined
    }
  }
  return { rate: checkable ? ok / checkable : null, failed }
}

function finish(table: TableResult, fileName: string, statementId: string, layoutForSupport: string): ParseResult {
  if (!table.headerFound) {
    throw new StatementError(
      'NO_TABLE',
      "Couldn't find the transaction table in this file. Try the CSV or Excel download from net banking.",
      anonymize(layoutForSupport),
    )
  }
  if (!table.rows.length) {
    throw new StatementError('NO_ROWS', 'Found the table header but no transactions under it.', anonymize(layoutForSupport))
  }

  let rows = table.rows
  // Statements listed newest-first are flipped so balances run forwards.
  if (rows.length > 1 && rows[0].date > rows[rows.length - 1].date) rows = rows.slice().reverse()

  const amounts = rows.map(readAmounts)
  const opening = parseAmount(table.openingBalance)?.paise
  const { rate, failed } = reconcile(amounts, opening)

  const { holderName, accountLast4 } = holderAndAccount(table.metaText, table.profile)
  const accountKey = `${table.profile.id}:${accountLast4 ?? fileName}`

  const txns: Txn[] = []
  rows.forEach((r, i) => {
    const a = amounts[i]
    if (!a.debit && !a.credit) return
    const info = parseNarration(r.narration)
    txns.push({
      id: `${statementId}:${txns.length + 1}`,
      statementId,
      accountKey,
      date: r.date,
      narration: r.narration,
      ref: r.ref,
      debit: a.debit,
      credit: a.credit,
      balance: a.balance,
      channel: info.channel,
      counterparty: info.counterparty,
      mandate: info.mandate,
    })
  })

  const warnings: string[] = []
  if (rate !== null && rate < 0.95) {
    warnings.push(
      `Only ${Math.round(rate * 100)}% of rows match the running balance, so some amounts may be misread. Check the rows listed below.`,
    )
  }
  if (rate === null) warnings.push('This file has no balance column, so amounts could not be double-checked.')
  if (!accountLast4) warnings.push("Couldn't find the account number; this file is treated as its own account.")

  const dates = txns.map((t) => t.date).sort()
  const statement: Statement = {
    id: statementId,
    fileName,
    bank: table.profile.id,
    bankName: table.profile.name,
    accountKey,
    accountLast4,
    holderName,
    from: dates[0],
    to: dates[dates.length - 1],
    rowCount: txns.length,
    reconcileRate: rate,
    failedRows: failed,
    warnings,
  }
  return { statement, txns }
}

export function parsePdfStatement(fileName: string, pages: PdfPageText[], statementId: string): ParseResult {
  const chars = pages.reduce((n, p) => n + p.items.reduce((m, it) => m + it.s.trim().length, 0), 0)
  if (chars < 40 * Math.max(1, pages.length) * 0.25) {
    throw new StatementError(
      'SCANNED',
      'This PDF looks scanned (it has no selectable text). Scanned statements are not supported yet; download the CSV or Excel version from net banking instead.',
    )
  }
  const table = tableFromPdf(pages)
  const layout = pages
    .slice(0, 2)
    .flatMap((p) => p.items.slice(0, 400).map((it) => `${Math.round(it.x)},${Math.round(it.y)} ${it.s}`))
    .join('\n')
  return finish(table, fileName, statementId, layout)
}

export function parseGridStatement(fileName: string, grid: string[][], statementId: string): ParseResult {
  const table = tableFromGrid(grid)
  const layout = grid
    .slice(0, 60)
    .map((r) => r.join(' | '))
    .join('\n')
  return finish(table, fileName, statementId, layout)
}
