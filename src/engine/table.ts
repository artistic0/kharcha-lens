import { parseLeadingDate } from './dates'
import { parseAmount } from './money'
import { assignRoles, groupLines, headerBands, type ColumnBand, type Line, type RoleRow } from './layout'
import { detectHeader, detectProfile, GENERIC_PROFILE, type BankProfile, type Role } from './profiles'
import type { PdfPageText } from './types'

/** One transaction as read from the table, before amounts are interpreted. */
export interface RawRow {
  date: string
  narration: string
  ref?: string
  debit?: string
  credit?: string
  amount?: string
  drcr?: string
  balance?: string
  /** 1-based position in the statement, for error messages. */
  rowNo: number
}

export interface TableResult {
  profile: BankProfile
  /** Text outside the table (account holder, account number, bank name). */
  metaText: string
  rows: RawRow[]
  openingBalance?: string
  headerFound: boolean
}

const AMOUNT_ROLES: Role[] = ['debit', 'credit', 'amount']

function matchesAny(text: string, list: RegExp[]) {
  return list.some((r) => r.test(text))
}

/** Re-join a narration that wrapped across lines; no space where it broke at "-" or "/". */
function joinWrapped(parts: string[]): string {
  let out = ''
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    out += !out || /[-/]$/.test(out) || /^[-/]/.test(p) ? p : ` ${p}`
  }
  return out.replace(/\s+/g, ' ')
}

/**
 * Turn role-tagged rows into transactions. A row with a date starts a new transaction;
 * a row without a date but with an amount reuses the previous date (some banks print
 * the date once per day); any other row is narration that wrapped onto another line.
 */
export function assembleRows(roleRows: RoleRow[], profile: BankProfile): { rows: RawRow[]; openingBalance?: string } {
  type Pending = RawRow & { page?: number; y?: number; extra: { text: string; page?: number; y?: number }[] }
  const txns: Pending[] = []
  const orphans: { text: string; page?: number; y?: number; after: number }[] = []
  let current: Pending | null = null
  let openingBalance: string | undefined
  let lastDate: string | null = null
  // Where the previous table line sat, so footers far below the last row are not glued on.
  let lastY: number | undefined
  let lastPage: number | undefined

  for (const r of roleRows) {
    const farBelow =
      r.y !== undefined && lastY !== undefined && r.page === lastPage && r.y - lastY > 2.2 * (r.h ?? 8)
    if (farBelow) current = null
    if (r.y !== undefined) {
      lastY = r.y
      lastPage = r.page
    }
    const upper = r.text.toUpperCase().trim()
    if (!upper) continue
    if (/^OPENING BALANCE/.test(upper) || /OPENING BALANCE/.test((r.narration ?? '').toUpperCase())) {
      openingBalance = r.balance ?? r.credit ?? r.amount
      current = null
      continue
    }
    if (matchesAny(upper, profile.stopLines)) {
      current = null
      break
    }
    if (matchesAny(upper, profile.skipLines)) {
      current = null
      continue
    }
    const date = parseLeadingDate(r.date) ?? null
    const hasAmount = AMOUNT_ROLES.some((k) => parseAmount(r[k]) !== null)
    if (date || (hasAmount && lastDate)) {
      current = {
        date: date ?? lastDate!,
        narration: (r.narration ?? '').trim(),
        ref: r.ref?.trim() || undefined,
        debit: r.debit,
        credit: r.credit,
        amount: r.amount,
        drcr: r.drcr,
        balance: r.balance,
        rowNo: txns.length + 1,
        page: r.page,
        y: r.y,
        extra: [],
      }
      txns.push(current)
      lastDate = current.date
      continue
    }
    const text = [r.narration, r.ref].filter(Boolean).join(' ').trim() || (r.date ?? '').trim()
    if (!text) continue
    if (profile.continuation === 'nearest') {
      orphans.push({ text, page: r.page, y: r.y, after: txns.length - 1 })
    } else if (current) {
      current.extra.push({ text })
    }
  }

  // Layouts that centre the dated line inside a wrapped narration: give each loose line to
  // the dated row nearest to it on the same page.
  for (const o of orphans) {
    let best: Pending | null = null
    let bestDist = Infinity
    for (const idx of [o.after, o.after + 1]) {
      const t = txns[idx]
      if (!t || t.page !== o.page || t.y === undefined || o.y === undefined) continue
      const d = Math.abs(t.y - o.y)
      if (d < bestDist || (d === bestDist && idx === o.after)) {
        best = t
        bestDist = d
      }
    }
    best?.extra.push({ text: o.text, y: o.y })
  }

  const rows: RawRow[] = txns.map((t) => {
    const isAbove = (e: { y?: number }) => e.y !== undefined && t.y !== undefined && e.y < t.y
    const before = t.extra.filter(isAbove).map((e) => e.text)
    const after = t.extra.filter((e) => !isAbove(e)).map((e) => e.text)
    const narration = joinWrapped([...before, t.narration, ...after].filter(Boolean))
    return {
      date: t.date,
      narration,
      ref: t.ref,
      debit: t.debit,
      credit: t.credit,
      amount: t.amount,
      drcr: t.drcr,
      balance: t.balance,
      rowNo: t.rowNo,
    }
  })
  return { rows, openingBalance }
}

/** Read a PDF's transaction table from positioned text. */
export function tableFromPdf(pages: PdfPageText[]): TableResult {
  const allLines: Line[] = pages.flatMap(groupLines)
  // Detect the bank from the text above the table only: narrations mention other banks.
  const firstHeader = allLines.findIndex((l) => headerBands(l, GENERIC_PROFILE))
  const above = (firstHeader >= 0 ? allLines.slice(0, firstHeader) : allLines.slice(0, 30)).map((l) => l.text).join('\n')
  const profile = detectProfile(above)

  const meta: string[] = []
  const roleRows: RoleRow[] = []
  let bands: ColumnBand[] | null = null
  let headerFound = false
  for (const line of allLines) {
    const hb = headerBands(line, profile)
    if (hb) {
      bands = hb
      headerFound = true
      continue
    }
    if (!bands) {
      meta.push(line.text)
      continue
    }
    roleRows.push(assignRoles(line, bands))
  }
  const { rows, openingBalance } = assembleRows(roleRows, profile)
  return { profile, metaText: meta.join('\n'), rows, openingBalance, headerFound }
}

/** Read a CSV/XLSX grid: find the header row, then map cells by column index. */
export function tableFromGrid(grid: string[][]): TableResult {
  const cleaned = grid.map((row) => row.map((c) => (c ?? '').toString().replace(/\s+/g, ' ').trim()))
  const firstHeader = cleaned.findIndex((r) => detectHeader(r, GENERIC_PROFILE))
  const above = cleaned.slice(0, firstHeader >= 0 ? firstHeader : 40)
  const profile = detectProfile(above.map((r) => r.filter(Boolean).join('  ')).join('\n'))

  const meta: string[] = []
  let headerIdx = -1
  let cols: { role: Role; index: number }[] | null = null
  for (let i = 0; i < cleaned.length; i++) {
    const found = detectHeader(cleaned[i], profile)
    if (found) {
      headerIdx = i
      cols = found
      break
    }
    const text = cleaned[i].filter(Boolean).join('  ')
    if (text) meta.push(text)
  }
  if (!cols) return { profile, metaText: meta.join('\n'), rows: [], headerFound: false }

  const roleRows: RoleRow[] = []
  for (let i = headerIdx + 1; i < cleaned.length; i++) {
    const cells = cleaned[i]
    const text = cells.filter(Boolean).join('  ')
    if (!text) continue
    // Repeated header rows (multi-sheet exports) are skipped.
    if (detectHeader(cells, profile)) continue
    const rr: RoleRow = { text }
    for (const c of cols) if (cells[c.index]) rr[c.role] = cells[c.index]
    roleRows.push(rr)
  }
  const { rows, openingBalance } = assembleRows(roleRows, profile)
  return { profile, metaText: meta.join('\n'), rows, openingBalance, headerFound: true }
}
