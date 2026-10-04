import { parseLeadingDate } from './dates'
import { parseAmount } from './money'
import { assignRoles, groupLines, headerBands, type ColumnBand, type Line, type RoleRow } from './layout'
import { pdfGridView, sheetGridView, type ColumnMapping, type GridView } from './gridView'
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
  /** The table as a plain grid, for the column wizard and inspector. */
  view?: GridView
}

const AMOUNT_ROLES: Role[] = ['debit', 'credit', 'amount']

function matchesAny(text: string, list: RegExp[]) {
  return list.some((r) => r.test(text))
}

/** Common UPI handles: a cut after one of these is a real gap, not a broken UPI ID. */
const UPI_HANDLES = new Set(
  'ybl ibl axl apl upi paytm ptybl ptyes ptaxis pthdfc ptsbi okaxis oksbi okicici okhdfcbank icici hdfcbank axisbank sbi kotak yesbank idfcbank axb abfspay jupiteraxis freecharge waaxis wahdfcbank wasbi waicici fbl rbl indus federal timecosmos'.split(' '),
)

/**
 * Was a narration cut inside one token rather than between words? Banks wrap long codes
 * mid-token: numbers ("6123400" + "0015"), letter-digit codes ("HDFC0MERU" + "PI"), and
 * UPI IDs ("NETFLIXUPI.PAYU@HDFCB" + "ANK"). Plain words are joined with a space.
 */
function cutInsideToken(prev: string, next: string): boolean {
  const a = prev.split(/[\s\-/]+/).pop() ?? ''
  const b = next.split(/[\s\-/]+/)[0] ?? ''
  if (!a || !b) return false
  if (/\d$/.test(a) && /^\d/.test(b)) return true
  if (/[@._]$/.test(a) || /^[@._]/.test(b)) return true
  if (a.includes('@')) return !UPI_HANDLES.has(a.split('@')[1].toLowerCase())
  if (b.includes('@')) return /^[A-Za-z0-9._]+$/.test(a) && /[A-Za-z0-9]$/.test(a)
  // A letter-digit code cut between letters ("HDFC0MERU" + "PI"); "…1234" + "HPCL" is two words.
  return /\d/.test(a) && /[A-Za-z]$/.test(a) && /^[A-Za-z]/.test(b)
}

/** Re-join a narration that wrapped across lines: no space where it broke at "-" or "/" or inside a token. */
function joinWrapped(parts: string[]): string {
  let out = ''
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    out += !out || /[-/]$/.test(out) || /^[-/]/.test(p) || cutInsideToken(out, p) ? p : ` ${p}`
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
    // A new page starts with the bank's page furniture, never with the previous narration.
    const newPage = r.page !== undefined && lastPage !== undefined && r.page !== lastPage
    if (farBelow || newPage) current = null
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
  return tableFromPdfLines(pages.flatMap(groupLines))
}

export function tableFromPdfLines(allLines: Line[]): TableResult {
  // Detect the bank from the text above the table only: narrations mention other banks.
  const firstHeader = allLines.findIndex((l) => headerBands(l, GENERIC_PROFILE))
  const above = (firstHeader >= 0 ? allLines.slice(0, firstHeader) : allLines.slice(0, 30)).map((l) => l.text).join('\n')
  const profile = detectProfile(above)

  // Pages that repeat the column titles: anything above them is page furniture.
  const headerAt = allLines.map((l) => headerBands(l, profile))
  const pagesWithHeader = new Set(allLines.filter((_, i) => headerAt[i]).map((l) => l.page))
  const seenHeaderOnPage = new Set<number>()

  const meta: string[] = []
  const roleRows: RoleRow[] = []
  let bands: ColumnBand[] | null = null
  let headerFound = false
  allLines.forEach((line, i) => {
    const hb = headerAt[i]
    if (hb) {
      bands = hb
      headerFound = true
      seenHeaderOnPage.add(line.page)
      return
    }
    if (!bands) {
      meta.push(line.text)
      return
    }
    if (pagesWithHeader.has(line.page) && !seenHeaderOnPage.has(line.page)) return
    roleRows.push(assignRoles(line, bands))
  })
  const { rows, openingBalance } = assembleRows(roleRows, profile)
  const view = pdfView(allLines, bands)
  return { profile, metaText: meta.join('\n'), rows, openingBalance, headerFound, view: view ?? undefined }
}

/** The PDF as a grid, with the automatic reader's column roles copied onto it. */
function pdfView(lines: Line[], headerBandsFound: ColumnBand[] | null): GridView | null {
  const view = pdfGridView(lines)
  if (!view) return null
  if (headerBandsFound && view.bands) {
    for (const hb of headerBandsFound) {
      if (hb.role === 'ignore') continue
      let best = -1
      let bestOverlap = 0
      view.bands.forEach((b, i) => {
        const overlap = Math.min(hb.x1, b.x1) - Math.max(hb.x0, b.x0)
        if (overlap > bestOverlap) {
          bestOverlap = overlap
          best = i
        }
      })
      if (best >= 0 && view.roles[best] === null) view.roles[best] = hb.role
    }
  }
  return view
}

/** Read a CSV/XLSX grid: find the header row, then map cells by column index. */
export function tableFromGrid(grid: string[][]): TableResult {
  const cleaned = cleanGrid(grid)
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
  if (!cols) {
    // No recognisable titles: guess where the table starts so the wizard has a sensible view.
    const start = guessSheetHeaderRow(cleaned)
    const metaText = cleaned
      .slice(0, start ?? 0)
      .map((r) => r.filter(Boolean).join('  '))
      .join('\n')
    return { profile, metaText: meta.join('\n'), rows: [], headerFound: false, view: sheetGridView(cleaned, start, null, metaText) }
  }

  const roles: (Role | null)[] = Array.from({ length: Math.max(...cleaned.slice(0, 200).map((r) => r.length)) }, () => null)
  for (const c of cols) roles[c.index] = c.role
  const view = sheetGridView(cleaned, headerIdx, roles, meta.join('\n'))

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
  return { profile, metaText: meta.join('\n'), rows, openingBalance, headerFound: true, view }
}

export const cleanGrid = (grid: string[][]) => grid.map((row) => row.map((c) => (c ?? '').toString().replace(/\s+/g, ' ').trim()))

/** For sheets without known titles: the row right above the first row that has a date. */
export function guessSheetHeaderRow(cleaned: string[][]): number | null {
  const firstDated = cleaned.findIndex((r) => r.some((c) => parseLeadingDate(c)))
  if (firstDated <= 0) return null
  const prev = cleaned[firstDated - 1]
  return prev.filter(Boolean).length >= 2 && !prev.some((c) => parseAmount(c) !== null && /[.,]/.test(c)) ? firstDated - 1 : null
}

/** Rows of a grid view turned into role-tagged rows using a (user-chosen) mapping. */
export function roleRowsFromView(view: GridView, mapping: ColumnMapping): RoleRow[] {
  const start = mapping.headerRow === null ? 0 : mapping.headerRow + 1
  const headerKey = mapping.headerRow === null ? null : view.rows[mapping.headerRow].join('|').toUpperCase()
  const out: RoleRow[] = []
  for (let i = start; i < view.rows.length; i++) {
    const cells = view.rows[i]
    const text = cells.filter(Boolean).join('  ')
    if (!text) continue
    if (headerKey && cells.join('|').toUpperCase() === headerKey) continue // titles repeated on a new page
    const rr: RoleRow = { text, ...(view.rowMeta?.[i] ?? {}) }
    mapping.roles.forEach((role, c) => {
      const v = cells[c]
      if (role && v) rr[role] = rr[role] ? `${rr[role]} ${v}` : v
    })
    out.push(rr)
  }
  return out
}

export function tableFromView(view: GridView, mapping: ColumnMapping, profile?: BankProfile): TableResult {
  const p = profile ?? detectProfile(view.metaText)
  const { rows, openingBalance } = assembleRows(roleRowsFromView(view, mapping), p)
  return { profile: p, metaText: view.metaText, rows, openingBalance, headerFound: true, view }
}
