import { looksLikeAmount } from './money'
import { detectHeader, type BankProfile, type Role } from './profiles'
import type { PdfPageText, PdfTextItem } from './types'

export interface Line {
  page: number
  y: number
  items: PdfTextItem[]
  text: string
}

/** Group a page's text items into visual lines (top to bottom, left to right). */
export function groupLines(page: PdfPageText): Line[] {
  const items = page.items
    .filter((it) => it.s.trim() !== '')
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Line[] = []
  for (const it of items) {
    const tol = Math.max(2, Math.min(4, it.h * 0.35))
    const last = lines[lines.length - 1]
    if (last && Math.abs(it.y - last.y) <= tol) {
      last.items.push(it)
    } else {
      lines.push({ page: page.page, y: it.y, items: [it], text: '' })
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
    line.text = joinItems(line.items)
  }
  return lines
}

function joinItems(items: PdfTextItem[]): string {
  let out = ''
  let prevEnd = -Infinity
  for (const it of items) {
    const gap = it.x - prevEnd
    if (out && gap > Math.max(1, it.h * 0.15)) out += gap > it.h * 1.2 ? '  ' : ' '
    out += it.s.trim()
    prevEnd = it.x + it.w
  }
  return out.trim()
}

interface Chunk {
  text: string
  x0: number
  x1: number
}

/** Merge items that sit close together into cell-sized chunks (used for header rows). */
export function chunks(line: Line): Chunk[] {
  const out: Chunk[] = []
  for (const it of line.items) {
    const last = out[out.length - 1]
    const gap = last ? it.x - last.x1 : Infinity
    if (last && gap < Math.max(3, it.h * 0.6)) {
      last.text += (gap > it.h * 0.15 ? ' ' : '') + it.s.trim()
      last.x1 = it.x + it.w
    } else {
      out.push({ text: it.s.trim(), x0: it.x, x1: it.x + it.w })
    }
  }
  return out
}

export interface ColumnBand {
  role: Role
  x0: number
  x1: number
}

export function headerBands(line: Line, profile: BankProfile): ColumnBand[] | null {
  const cs = chunks(line)
  const cols = detectHeader(
    cs.map((c) => c.text),
    profile,
  )
  if (!cols) return null
  return cols.map((c) => ({ role: c.role, x0: cs[c.index].x0, x1: cs[c.index].x1 })).sort((a, b) => a.x0 - b.x0)
}

const NUMERIC_ROLES: Role[] = ['debit', 'credit', 'amount', 'balance']

export type RoleRow = Partial<Record<Role, string>> & { page?: number; y?: number; h?: number; text: string }

/**
 * Put each item of a data line into a column. Text is left-aligned, so it goes to the
 * column whose header starts at or before it. Amounts are usually right-aligned, so they
 * go to the nearest numeric column by center.
 */
export function assignRoles(line: Line, bands: ColumnBand[]): RoleRow {
  const parts: Partial<Record<Role, string[]>> = {}
  const numericBands = bands.filter((b) => NUMERIC_ROLES.includes(b.role))
  for (const it of line.items) {
    const s = it.s.trim()
    if (!s) continue
    let role: Role
    if (looksLikeAmount(s) && numericBands.length) {
      const cx = it.x + it.w / 2
      role = numericBands.reduce((best, b) =>
        Math.abs((b.x0 + b.x1) / 2 - cx) < Math.abs((best.x0 + best.x1) / 2 - cx) ? b : best,
      ).role
    } else {
      const pad = 2
      let owner = bands[0]
      for (const b of bands) if (b.x0 - pad <= it.x) owner = b
      // A bare "Cr"/"Dr" marker belongs with the amount just before it.
      if (/^(CR|DR)\.?$/i.test(s) && NUMERIC_ROLES.includes(owner.role) === false) {
        const prev = numericBands.filter((b) => b.x0 <= it.x).pop()
        if (prev) owner = prev
      }
      role = owner.role
    }
    ;(parts[role] ??= []).push(s)
  }
  const h = Math.max(...line.items.map((it) => it.h))
  const row: RoleRow = { page: line.page, y: line.y, h, text: line.text }
  for (const [role, list] of Object.entries(parts)) row[role as Role] = list!.join(' ')
  return row
}
