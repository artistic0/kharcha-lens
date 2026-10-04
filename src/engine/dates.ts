const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))

/**
 * Parse the date formats Indian banks use into ISO yyyy-mm-dd. Day-first is assumed
 * for numeric dates (dd/mm/yy), which is what every Indian bank statement uses.
 */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().toUpperCase()
  if (!s) return null

  // ISO 2026-07-01 (CSV exports)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))

  // 01/07/2026, 1-7-26, 01.07.2026 (optionally followed by a time)
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?$/)
  if (m) return valid(fullYear(m[3]), Number(m[2]), Number(m[1]))

  // 01-Jul-2026, 1 Jul 2026, 01/JUL/26, 01-July-2026
  m = s.match(/^(\d{1,2})[\s/.-]*([A-Z]{3,9})[\s/.,-]*(\d{2}|\d{4})$/)
  if (m) {
    const mon = MONTHS[m[2].slice(0, 4)] ?? MONTHS[m[2].slice(0, 3)]
    if (mon) return valid(fullYear(m[3]), mon, Number(m[1]))
  }

  // Jul 01, 2026
  m = s.match(/^([A-Z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3)]
    if (mon) return valid(Number(m[3]), mon, Number(m[2]))
  }
  return null
}

/** Pull the first date-looking token out of a cell ("01/07/26 10:22" or "01 Jul 2026"). */
export function parseLeadingDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  const direct = parseDate(s)
  if (direct) return direct
  const m = s.match(/^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s/-][A-Za-z]{3,9}[\s/-]\d{2,4}|\d{4}-\d{2}-\d{2})/)
  return m ? parseDate(m[1]) : null
}

export const monthKey = (isoDate: string) => isoDate.slice(0, 7)

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(Date.parse(iso) + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthShortFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' })
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export const formatMonth = (mk: string) => monthFmt.format(new Date(`${mk}-01T00:00:00Z`))
export const formatMonthShort = (mk: string) => monthShortFmt.format(new Date(`${mk}-01T00:00:00Z`))
export const formatDay = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`))
