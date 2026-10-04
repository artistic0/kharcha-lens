import generic from './profiles/generic.json'
import hdfc from './profiles/hdfc.json'
import icici from './profiles/icici.json'
import sbi from './profiles/sbi.json'

export type Role =
  | 'date'
  | 'valueDate'
  | 'narration'
  | 'ref'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'drcr'
  | 'balance'
  | 'serial'

export const ROLES: Role[] = [
  'date', 'valueDate', 'narration', 'ref', 'debit', 'credit', 'amount', 'drcr', 'balance', 'serial',
]

/** Shape of a profile JSON file. Adding a bank = adding one of these, no code. */
interface ProfileJson {
  id: string
  name: string
  detect: string[]
  continuation?: 'below' | 'nearest'
  columns?: Partial<Record<Role, string[]>>
  holder?: string[]
  account?: string[]
  stopLines?: string[]
  skipLines?: string[]
}

export interface BankProfile {
  id: string
  name: string
  detect: RegExp[]
  continuation: 'below' | 'nearest'
  /** Normalized aliases per role, bank-specific first, then generic. */
  columns: Record<Role, string[]>
  holder: RegExp[]
  account: RegExp[]
  stopLines: RegExp[]
  skipLines: RegExp[]
}

/** Lowercase, drop "(INR)"-style unit suffixes and punctuation, keep "/" tight. */
export function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(\s*(inr|rs\.?|₹)\s*\)/g, ' ')
    .replace(/\bin\s+(inr|rs\.?)\b/g, ' ')
    .replace(/[^a-z0-9/#]+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

const rx = (list: string[] | undefined) => (list ?? []).map((p) => new RegExp(p, 'im'))

function build(p: ProfileJson, base?: ProfileJson): BankProfile {
  const columns = {} as Record<Role, string[]>
  for (const role of ROLES) {
    const own = p.columns?.[role] ?? []
    const inherited = base?.columns?.[role] ?? []
    columns[role] = [...new Set([...own, ...inherited].map(normalizeHeader))]
  }
  return {
    id: p.id,
    name: p.name,
    detect: rx(p.detect),
    continuation: p.continuation ?? base?.continuation ?? 'below',
    columns,
    holder: [...rx(p.holder), ...(p === base ? [] : rx(base?.holder))],
    account: [...rx(p.account), ...(p === base ? [] : rx(base?.account))],
    stopLines: [...rx(p.stopLines), ...(p === base ? [] : rx(base?.stopLines))],
    skipLines: [...rx(p.skipLines), ...(p === base ? [] : rx(base?.skipLines))],
  }
}

const genericJson = generic as ProfileJson
export const GENERIC_PROFILE = build(genericJson, genericJson)
export const PROFILES: BankProfile[] = [hdfc, sbi, icici].map((p) => build(p as ProfileJson, genericJson))

/** Pick the bank whose detect patterns match the statement's header text. */
export function detectProfile(headerText: string): BankProfile {
  let best: BankProfile = GENERIC_PROFILE
  let bestHits = 0
  for (const p of PROFILES) {
    const hits = p.detect.filter((r) => r.test(headerText)).length
    if (hits > bestHits) {
      best = p
      bestHits = hits
    }
  }
  return best
}

export interface HeaderColumn {
  role: Role
  index: number
}

/** Map one header cell to a role using the longest matching alias. */
export function roleForHeader(cell: string, profile: BankProfile): Role | null {
  const h = normalizeHeader(cell)
  if (!h) return null
  let best: { role: Role; len: number } | null = null
  for (const role of ROLES) {
    for (const alias of profile.columns[role]) {
      if (h === alias || h.startsWith(`${alias} `)) {
        const len = h === alias ? alias.length + 1000 : alias.length
        if (!best || len > best.len) best = { role, len }
      }
    }
  }
  return best?.role ?? null
}

/**
 * Decide whether a row of cells is the transaction table header. It must name a date,
 * some amount, and either a narration or a balance.
 */
export function detectHeader(cells: string[], profile: BankProfile): HeaderColumn[] | null {
  const cols: HeaderColumn[] = []
  const seen = new Set<Role>()
  cells.forEach((cell, index) => {
    const role = roleForHeader(cell, profile)
    if (role && !seen.has(role)) {
      seen.add(role)
      cols.push({ role, index })
    }
  })
  const hasAmount = seen.has('debit') || seen.has('credit') || seen.has('amount')
  if (seen.has('date') && hasAmount && (seen.has('narration') || seen.has('balance')) && seen.size >= 3) {
    return cols
  }
  // Some layouts only print "Value Date": accept it as the transaction date.
  if (!seen.has('date') && seen.has('valueDate') && hasAmount && seen.size >= 3) {
    return cols.map((c) => (c.role === 'valueDate' ? { ...c, role: 'date' as Role } : c))
  }
  return null
}
