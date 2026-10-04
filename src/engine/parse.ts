import { parseAmount } from './money'
import { parseNarration } from './narration'
import { groupLines } from './layout'
import { pdfGridView, suggestMapping, type ColumnMapping, type CustomLayout, type GridView } from './gridView'
import { detectProfile, normalizeHeader, type BankProfile } from './profiles'
import { cleanGrid, tableFromGrid, tableFromPdfLines, tableFromView, type RawRow, type TableResult } from './table'
import type { ParseResult, PdfPageText, Statement, Txn } from './types'

export class StatementError extends Error {
  code: 'NO_TABLE' | 'NO_ROWS' | 'SCANNED' | 'PASSWORD' | 'UNSUPPORTED'
  /** Layout with letters/digits masked, safe to share for support. */
  anonymizedLayout?: string
  /** The file as a grid with suggested column roles, so the column wizard can open. */
  view?: GridView
  constructor(code: StatementError['code'], message: string, anonymizedLayout?: string, view?: GridView) {
    super(message)
    this.code = code
    this.anonymizedLayout = anonymizedLayout
    this.view = view
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

interface FinishOptions {
  /** Bank name the user gave a custom layout. */
  bankName?: string
}

function finish(table: TableResult, fileName: string, statementId: string, layoutForSupport: string, opts: FinishOptions = {}): ParseResult {
  // Keep the grid with every result; if the reader found no roles, pre-fill guesses for the wizard.
  const view = table.view && !table.view.roles.some(Boolean) ? { ...table.view, roles: suggestMapping(table.view, table.profile).roles } : table.view
  if (!table.headerFound) {
    throw new StatementError(
      'NO_TABLE',
      "Couldn't find the transaction table in this file. You can point out the columns yourself, or try the CSV or Excel download from net banking.",
      anonymize(layoutForSupport),
      view,
    )
  }
  if (!table.rows.length) {
    throw new StatementError('NO_ROWS', 'Found the table header but no transactions under it.', anonymize(layoutForSupport), view)
  }

  let rows = table.rows
  // Statements listed newest-first are flipped so balances run forwards.
  if (rows.length > 1 && rows[0].date > rows[rows.length - 1].date) rows = rows.slice().reverse()

  const amounts = rows.map(readAmounts)
  const opening = parseAmount(table.openingBalance)?.paise
  const { rate, failed } = reconcile(amounts, opening)

  const { holderName, accountLast4 } = holderAndAccount(table.metaText, table.profile)
  const bank = opts.bankName ? 'custom' : table.profile.id
  const accountKey = `${bank}:${accountLast4 ?? fileName}`

  const txns: Txn[] = []
  const txnOfRow: (string | undefined)[] = []
  rows.forEach((r, i) => {
    const a = amounts[i]
    if (!a.debit && !a.credit) return
    const info = parseNarration(r.narration)
    txnOfRow[i] = `${statementId}:${txns.length + 1}`
    txns.push({
      id: txnOfRow[i]!,
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
      `Only ${Math.round(rate * 100)}% of rows match the running balance, so some amounts may be misread. Use “Fix columns” to check which column is which.`,
    )
  }
  if (rate === null) warnings.push('This file has no balance column, so amounts could not be double-checked.')
  if (!accountLast4) warnings.push("Couldn't find the account number; this file is treated as its own account.")

  const dates = txns.map((t) => t.date).sort()
  const statement: Statement = {
    id: statementId,
    fileName,
    bank,
    bankName: opts.bankName ?? table.profile.name,
    accountKey,
    accountLast4,
    holderName,
    from: dates[0],
    to: dates[dates.length - 1],
    rowCount: txns.length,
    reconcileRate: rate,
    failedRows: failed,
    failedTxnIds: failed.map((n) => txnOfRow[n - 1]).filter((x): x is string => !!x),
    warnings,
  }
  return { statement, txns, view }
}

export const layoutText = (view: GridView) =>
  view.rows
    .slice(0, 60)
    .map((r) => r.join(' | '))
    .join('\n')

/** Apply a column mapping (from the wizard or a saved layout) to a grid view. */
export function parseMapped(fileName: string, view: GridView, mapping: ColumnMapping, statementId: string, bankName?: string): ParseResult {
  const table = tableFromView(view, mapping, detectProfile(view.metaText))
  const mapped: GridView = { ...view, headerRow: mapping.headerRow, roles: mapping.roles }
  return finish({ ...table, view: mapped }, fileName, statementId, layoutText(view), { bankName })
}

export interface MappingCheck {
  ok: boolean
  count: number
  rate: number | null
  result?: ParseResult
  message?: string
}

/** Try a mapping without throwing: how many rows it reads and how many balances check out. */
export function checkMapping(view: GridView, mapping: ColumnMapping, fileName = 'preview', bankName?: string): MappingCheck {
  try {
    const result = parseMapped(fileName, view, mapping, 'preview', bankName)
    return { ok: result.txns.length > 0, count: result.txns.length, rate: result.statement.reconcileRate, result }
  } catch (e) {
    return { ok: false, count: 0, rate: null, message: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Best first guess for the wizard: the roles already on the view (or suggested ones), with
 * debit and credit swapped if that makes more balances check out (banks order them differently).
 */
export function bestMapping(view: GridView): ColumnMapping {
  const m: ColumnMapping = view.roles.some(Boolean)
    ? { headerRow: view.headerRow, roles: view.roles, bands: view.bands }
    : suggestMapping(view, detectProfile(view.metaText))
  const d = m.roles.indexOf('debit')
  const c = m.roles.indexOf('credit')
  if (d < 0 || c < 0) return m
  const swapped: ColumnMapping = { ...m, roles: m.roles.map((r, i) => (i === d ? 'credit' : i === c ? 'debit' : r)) }
  const a = checkMapping(view, m)
  const b = checkMapping(view, swapped)
  return (b.rate ?? -1) > (a.rate ?? -1) ? swapped : m
}

/** Sheets: a title-row signature for any row, to find the saved layout's titles again. */
function rowFingerprint(cells: string[], width: number): string {
  const row = Array.from({ length: width }, (_, k) => cells[k] ?? '')
  return `sheet:h:${row.map((c) => normalizeHeader(c).replace(/\d/g, '#')).join('|')}`
}

/** A saved layout matching this file: PDFs by their title line, sheets by any title row. */
function savedLayoutFor(view: GridView | undefined, layouts: CustomLayout[]): { layout: CustomLayout; headerRow: number | null } | undefined {
  if (!view || !layouts.length) return undefined
  if (view.kind === 'pdf') {
    const layout = layouts.find((l) => l.kind === 'pdf' && l.fingerprint === view.fingerprint && !l.fingerprint.includes(':c:'))
    return layout ? { layout, headerRow: view.headerRow } : undefined
  }
  const sheetLayouts = layouts.filter((l) => l.kind === 'sheet' && l.fingerprint.startsWith('sheet:h:'))
  const width = view.rows.reduce((n, r) => Math.max(n, r.length), 0)
  for (let i = 0; i < Math.min(view.rows.length, 80); i++) {
    const fp = rowFingerprint(view.rows[i], width)
    const layout = sheetLayouts.find((l) => l.fingerprint === fp)
    if (layout) return { layout, headerRow: i }
  }
  return undefined
}

export function parsePdfStatement(fileName: string, pages: PdfPageText[], statementId: string, customLayouts: CustomLayout[] = []): ParseResult {
  const chars = pages.reduce((n, p) => n + p.items.reduce((m, it) => m + it.s.trim().length, 0), 0)
  if (chars < 40 * Math.max(1, pages.length) * 0.25) {
    throw new StatementError(
      'SCANNED',
      'This PDF looks scanned (it has no selectable text). Scanned statements are not supported yet; download the CSV or Excel version from net banking instead.',
    )
  }
  const lines = pages.flatMap(groupLines)
  const table = tableFromPdfLines(lines)
  const saved = savedLayoutFor(table.view, customLayouts)
  if (saved?.layout.mapping.bands) {
    // Re-cut this file with exactly the columns the user confirmed last time.
    const view = pdfGridView(lines, saved.layout.mapping.bands)
    if (view) return parseMapped(fileName, view, { ...saved.layout.mapping, headerRow: view.headerRow }, statementId, saved.layout.name)
  }
  const layout = pages
    .slice(0, 2)
    .flatMap((p) => p.items.slice(0, 400).map((it) => `${Math.round(it.x)},${Math.round(it.y)} ${it.s}`))
    .join('\n')
  return finish(table, fileName, statementId, layout)
}

export function parseGridStatement(fileName: string, grid: string[][], statementId: string, customLayouts: CustomLayout[] = []): ParseResult {
  const table = tableFromGrid(grid)
  const saved = savedLayoutFor(table.view, customLayouts)
  if (saved && table.view) {
    const view: GridView = { ...table.view, headerRow: saved.headerRow }
    return parseMapped(fileName, view, { ...saved.layout.mapping, headerRow: saved.headerRow }, statementId, saved.layout.name)
  }
  const layout = cleanGrid(grid)
    .slice(0, 60)
    .map((r) => r.join(' | '))
    .join('\n')
  return finish(table, fileName, statementId, layout)
}

/** Build the layout the user taught us, ready to save (no transaction data inside). */
export function toCustomLayout(view: GridView, mapping: ColumnMapping, name: string): CustomLayout {
  const width = view.rows.reduce((n, r) => Math.max(n, r.length), 0)
  const fingerprint =
    view.kind === 'sheet' && mapping.headerRow !== null ? rowFingerprint(view.rows[mapping.headerRow], width) : view.fingerprint
  return { fingerprint, name: name.trim() || 'My bank', kind: view.kind, mapping: { headerRow: mapping.headerRow, roles: mapping.roles, bands: view.bands } }
}
