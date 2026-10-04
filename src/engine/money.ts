import type { Paise } from './types'

export interface ParsedAmount {
  paise: Paise
  /** 'CR' / 'DR' when the cell carried a suffix, else undefined. */
  side?: 'CR' | 'DR'
}

const AMOUNT_RE = /^(-)?\(?(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?\)?$/

/**
 * Parse an Indian-formatted amount ("1,23,456.78", "500.00 Cr", "(1,200.00)", "₹ 99")
 * into integer paise without touching floats. Returns null for anything that is not
 * a plain amount.
 */
export function parseAmount(raw: string | number | null | undefined): ParsedAmount | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return { paise: Math.round(raw * 100) }
  }
  let s = raw.trim().toUpperCase()
  if (!s) return null
  let side: ParsedAmount['side']
  const sideMatch = s.match(/\s*\(?(CR|DR)\)?\.?$/)
  if (sideMatch) {
    side = sideMatch[1] as 'CR' | 'DR'
    s = s.slice(0, sideMatch.index).trim()
  }
  s = s.replace(/^(₹|RS\.?|INR)\s*/, '').replace(/\s+/g, '')
  const negativeParens = s.startsWith('(') && s.endsWith(')')
  const m = s.match(AMOUNT_RE)
  if (!m) return null
  const whole = Number(m[2].replace(/,/g, ''))
  const frac = m[3] ? Number(m[3].padEnd(2, '0')) : 0
  let paise = whole * 100 + frac
  if (m[1] || negativeParens) paise = -paise
  return { paise, side }
}

/** True for strings that look like a money cell (needs a decimal part or grouping comma). */
export function looksLikeAmount(s: string): boolean {
  const t = s.trim()
  return /^-?\(?(₹\s*)?[\d,]+\.\d{2}\)?(\s?\(?(CR|DR|Cr|Dr|cr|dr)\)?)?$/.test(t)
}

const inr0 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
const inr2 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatINR(paise: Paise, exact = false): string {
  return (exact ? inr2 : inr0).format(paise / 100)
}

/** Compact rupees using Indian units: ₹950, ₹12.3K, ₹4.5L, ₹1.2Cr */
export function formatINRCompact(paise: Paise): string {
  const r = paise / 100
  const abs = Math.abs(r)
  const sign = r < 0 ? '-' : ''
  const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ''))
  if (abs >= 1e7) return `${sign}₹${fmt(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${fmt(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}₹${fmt(abs / 1e3)}K`
  return `${sign}₹${abs.toFixed(0)}`
}
