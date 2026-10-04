import { parseLeadingDate } from './dates'
import type { Line } from './layout'
import { looksLikeAmount, parseAmount } from './money'
import { GENERIC_PROFILE, normalizeHeader, roleForHeader, type BankProfile, type Role } from './profiles'

/**
 * A statement as a plain table of cells, whatever the file type. It is what the column
 * wizard shows and what a user-chosen mapping is applied to. Lives in memory only.
 */
export interface GridView {
  kind: 'pdf' | 'sheet'
  /** Every row of the table area, as cell text. */
  rows: string[][]
  /** PDF only: where each row sat on the page (for wrapped-narration handling). */
  rowMeta?: { page: number; y: number; h: number }[]
  /** Index into `rows` of the column-title row, if there is one. */
  headerRow: number | null
  /** Role for each column: what the reader detected, or its best guess. */
  roles: (Role | null)[]
  /** PDF only: horizontal extent of each column. */
  bands?: Band[]
  /** Text above the table (holder name, account number). Never stored or shared. */
  metaText: string
  /** PDF only: the column-title line's text, used for the fingerprint. */
  headerText?: string
  /** Anonymous signature of the layout, used to recognise it next time. */
  fingerprint: string
}

export interface Band {
  x0: number
  x1: number
}

export interface ColumnMapping {
  headerRow: number | null
  roles: (Role | null)[]
  /** PDF only: column extents, so the same layout can be re-cut identically next time. */
  bands?: Band[]
}

export interface CustomLayout {
  fingerprint: string
  name: string
  kind: 'pdf' | 'sheet'
  mapping: ColumnMapping
}

const lineStartsWithDate = (l: Line) => !!parseLeadingDate(l.items[0]?.s ?? '') || !!parseLeadingDate(l.text.slice(0, 12))

interface Word {
  s: string
  x: number
  w: number
}

/**
 * Split text runs into words with estimated positions. PDF text runs often join cells that
 * sit close together ("0000612340000016 02/07/26"), which would hide the column gap.
 */
function words(line: Line): Word[] {
  const out: Word[] = []
  for (const it of line.items) {
    const s = it.s
    if (!s.trim()) continue
    const cw = it.w / Math.max(1, s.length)
    const re = /\S+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) out.push({ s: m[0], x: it.x + m.index * cw, w: m[0].length * cw })
  }
  return out
}

/**
 * Find a PDF's columns from the whitespace between them: across the dated lines, any x
 * position that no line puts text on is a gap between columns. Sparse columns (deposits
 * on a spending account) still count, even if only a few lines use them.
 */
export function inferBands(lines: Line[]): Band[] | null {
  const data = lines.filter(lineStartsWithDate)
  if (data.length < 3) return null
  const dataWords = data.map(words)
  const maxX = Math.ceil(Math.max(...dataWords.flatMap((ws) => ws.map((w) => w.x + w.w)))) + 1
  const cover = new Uint32Array(maxX + 1)
  for (const ws of dataWords) {
    for (const w of ws) {
      for (let x = Math.max(0, Math.floor(w.x)); x <= Math.min(maxX, Math.ceil(w.x + w.w)); x++) cover[x]++
    }
  }
  const bands: Band[] = []
  let start = -1
  for (let x = 0; x <= maxX + 1; x++) {
    const on = x <= maxX && cover[x] > 0
    if (on && start < 0) start = x
    if (!on && start >= 0) {
      bands.push({ x0: start, x1: x - 1 })
      start = -1
    }
  }
  // Join slivers separated by a hair (kerning inside one column).
  const merged: Band[] = []
  for (const b of bands) {
    const last = merged[merged.length - 1]
    if (last && b.x0 - last.x1 <= 2) last.x1 = b.x1
    else merged.push({ ...b })
  }
  return merged.length >= 2 ? merged : null
}

/** Put each word on a line into the band it overlaps most. */
export function cutLine(line: Line, bands: Band[]): string[] {
  const cells: string[][] = bands.map(() => [])
  for (const it of words(line)) {
    const s = it.s
    const a = it.x
    const b = it.x + it.w
    let best = -1
    let bestScore = -Infinity
    bands.forEach((band, i) => {
      const overlap = Math.min(b, band.x1) - Math.max(a, band.x0)
      const score = overlap > 0 ? overlap : -Math.min(Math.abs(a - band.x1), Math.abs(b - band.x0))
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    })
    cells[best].push(s)
  }
  return cells.map((c) => c.join(' '))
}

/** Build the grid view of a PDF from its lines (all pages). */
export function pdfGridView(lines: Line[], bandsOverride?: Band[]): GridView | null {
  const bands = bandsOverride ?? inferBands(lines)
  if (!bands) return null
  const firstData = lines.findIndex(lineStartsWithDate)
  if (firstData < 0) return null
  // The column titles are usually the line just above the first dated line.
  let headerLine = -1
  for (let i = firstData - 1; i >= Math.max(0, firstData - 3); i--) {
    const l = lines[i]
    if (l.page === lines[firstData].page && l.items.length >= 2 && !l.items.some((it) => looksLikeAmount(it.s))) {
      headerLine = i
      break
    }
  }
  const start = headerLine >= 0 ? headerLine : firstData
  const tableLines = lines.slice(start)
  const rows = tableLines.map((l) => cutLine(l, bands))
  const rowMeta = tableLines.map((l) => ({ page: l.page, y: l.y, h: Math.max(...l.items.map((it) => it.h)) }))
  const metaText = lines
    .slice(0, start)
    .map((l) => l.text)
    .join('\n')
  const view: GridView = {
    kind: 'pdf',
    rows,
    rowMeta,
    headerRow: headerLine >= 0 ? 0 : null,
    roles: bands.map(() => null),
    bands,
    metaText,
    headerText: headerLine >= 0 ? lines[headerLine].text : undefined,
    fingerprint: '',
  }
  view.fingerprint = fingerprint(view)
  return view
}

export function sheetGridView(cleaned: string[][], headerRow: number | null, roles: (Role | null)[] | null, metaText: string): GridView {
  const width = Math.max(0, ...cleaned.slice(0, 200).map((r) => r.length))
  const view: GridView = {
    kind: 'sheet',
    rows: cleaned.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')),
    headerRow,
    roles: roles ?? Array.from({ length: width }, () => null),
    metaText,
    fingerprint: '',
  }
  view.fingerprint = fingerprint(view)
  return view
}

/**
 * Anonymous layout signature. Uses only column titles (never row values), with any digits
 * masked; without titles, the column count and rounded positions.
 */
export function fingerprint(view: Pick<GridView, 'kind' | 'rows' | 'headerRow' | 'bands' | 'headerText'>): string {
  // PDFs: the title line's words, independent of how the columns were cut this time.
  if (view.kind === 'pdf' && view.headerText) return `pdf:h:${normalizeHeader(view.headerText).replace(/\d/g, '#')}`
  if (view.headerRow !== null) {
    const titles = view.rows[view.headerRow].map((c) => normalizeHeader(c).replace(/\d/g, '#'))
    return `${view.kind}:h:${titles.join('|')}`
  }
  if (view.bands) return `${view.kind}:b:${view.bands.map((b) => Math.round(b.x0 / 5) * 5).join(',')}`
  return `${view.kind}:c:${view.rows[0]?.length ?? 0}`
}

// ---------------------------------------------------------------------------
// Guessing what each column is
// ---------------------------------------------------------------------------

interface ColumnStats {
  filled: number
  dates: number
  amounts: number
  drcr: number
  letters: number
  totalLen: number
}

const isAmountCell = (s: string) => {
  const t = s.trim()
  if (!t) return false
  // Long bare digit runs are reference numbers, not money.
  if (/^\d{7,}$/.test(t)) return false
  return looksLikeAmount(t) || (parseAmount(t) !== null && /\d/.test(t))
}

function stats(rows: string[][], width: number): ColumnStats[] {
  const out: ColumnStats[] = Array.from({ length: width }, () => ({ filled: 0, dates: 0, amounts: 0, drcr: 0, letters: 0, totalLen: 0 }))
  for (const r of rows) {
    for (let i = 0; i < width; i++) {
      const c = (r[i] ?? '').trim()
      if (!c) continue
      const s = out[i]
      s.filled++
      s.totalLen += c.length
      if (parseLeadingDate(c)) s.dates++
      else if (isAmountCell(c)) s.amounts++
      if (/^(DR|CR|D|C|DEBIT|CREDIT)\.?$/i.test(c)) s.drcr++
      if (/[A-Za-z]{3,}/.test(c)) s.letters++
    }
  }
  return out
}

/**
 * Suggest a role for every column: column titles first (the same aliases the automatic
 * reader uses), then the content of the cells.
 */
export function suggestRoles(view: GridView, profile: BankProfile = GENERIC_PROFILE): (Role | null)[] {
  const width = view.rows.reduce((n, r) => Math.max(n, r.length), 0)
  const roles: (Role | null)[] = Array.from({ length: width }, () => null)
  const used = new Set<Role>()
  if (view.headerRow !== null) {
    view.rows[view.headerRow].forEach((cell, i) => {
      const r = roleForHeader(cell, profile)
      if (r && !used.has(r)) {
        roles[i] = r
        used.add(r)
      }
    })
  }

  // Judge columns on transaction rows only: drop repeated title rows, page footers, and
  // everything after an end-of-statement summary (the same lines the reader skips).
  const headerKey = view.headerRow === null ? null : view.rows[view.headerRow].join('|').toUpperCase()
  const body: string[][] = []
  for (const r of view.rows.slice(view.headerRow === null ? 0 : view.headerRow + 1)) {
    const text = r.filter(Boolean).join('  ').toUpperCase().trim()
    if (!text) continue
    if (profile.stopLines.some((re) => re.test(text))) break
    if (headerKey && r.join('|').toUpperCase() === headerKey) continue
    if (profile.skipLines.some((re) => re.test(text))) continue
    body.push(r)
    if (body.length >= 400) break
  }
  // Page footers and wrapped narration carry no date; transaction rows do. Judge on those.
  const dated = body.filter((r) => r.some((c) => parseLeadingDate(c)))
  if (dated.length >= 3) body.splice(0, body.length, ...dated)
  const st = stats(body, width)
  const frac = (n: number, s: ColumnStats) => (s.filled ? n / s.filled : 0)
  const free = (i: number) => roles[i] === null
  const take = (i: number, r: Role) => {
    roles[i] = r
    used.add(r)
  }

  if (!used.has('date')) {
    const i = st.findIndex((s, k) => free(k) && frac(s.dates, s) >= 0.6)
    if (i >= 0) take(i, 'date')
  }
  st.forEach((s, i) => {
    if (free(i) && frac(s.dates, s) >= 0.6 && !used.has('valueDate')) take(i, 'valueDate')
  })
  if (!used.has('drcr')) {
    const i = st.findIndex((s, k) => free(k) && s.filled >= 3 && frac(s.drcr, s) >= 0.8)
    if (i >= 0) take(i, 'drcr')
  }

  // Serial numbers (1, 2, 3…) look numeric but are not money.
  const isSerial = (i: number) => {
    const vals = body.map((r) => (r[i] ?? '').trim()).filter(Boolean)
    if (vals.length < 3 || !vals.every((v) => /^\d{1,6}$/.test(v))) return false
    let steps = 0
    for (let k = 1; k < vals.length; k++) if (Math.abs(Number(vals[k]) - Number(vals[k - 1])) === 1) steps++
    return steps >= (vals.length - 1) * 0.8
  }
  const numeric = st
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => free(i) && s.filled >= 2 && frac(s.amounts, s) >= 0.6 && !isSerial(i))
  const hasNumericRole = (['debit', 'credit', 'amount', 'balance'] as Role[]).some((r) => used.has(r))
  if (!hasNumericRole && numeric.length) {
    // The balance is filled on (nearly) every dated row; take the rightmost such column.
    // (PDF grids also hold wrapped-narration lines, which carry no amounts at all.)
    const datedRows = body.filter((r) => r.some((c) => parseLeadingDate(c))).length || Math.max(...st.map((s) => s.filled))
    const rowsWithData = datedRows
    const balance = [...numeric].reverse().find(({ s }) => s.filled >= rowsWithData * 0.9)
    const rest = numeric.filter((n) => n !== balance)
    if (balance && rest.length >= 1) take(balance.i, 'balance')
    const amounts = balance && rest.length >= 1 ? rest : numeric
    if (used.has('drcr') || amounts.length === 1) take(amounts[0].i, 'amount')
    else if (amounts.length >= 2) {
      take(amounts[0].i, 'debit')
      take(amounts[1].i, 'credit')
    }
  }

  if (!used.has('narration')) {
    let best = -1
    let bestLen = 0
    st.forEach((s, i) => {
      const avg = s.filled ? s.totalLen / s.filled : 0
      if (free(i) && frac(s.letters, s) >= 0.5 && avg > bestLen) {
        best = i
        bestLen = avg
      }
    })
    if (best >= 0) take(best, 'narration')
  }
  return roles
}

/** Default mapping for a view: detected roles where known, guesses elsewhere. */
export function suggestMapping(view: GridView, profile?: BankProfile): ColumnMapping {
  const known = view.roles.some((r) => r !== null)
  return { headerRow: view.headerRow, roles: known ? view.roles : suggestRoles(view, profile), bands: view.bands }
}
