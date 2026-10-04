import { CATEGORY_BY_ID, isSpend, SPEND_CATEGORIES } from './categories'
import { monthKey } from './dates'
import type { CategoryId, EnrichedTxn, Paise } from './types'

export interface Filter {
  /** null = all accounts */
  accounts: string[] | null
  /** yyyy-mm inclusive bounds */
  from?: string
  to?: string
}

export function applyFilter(txns: EnrichedTxn[], f: Filter): EnrichedTxn[] {
  const acc = f.accounts ? new Set(f.accounts) : null
  return txns.filter((t) => {
    if (acc && !acc.has(t.accountKey)) return false
    const mk = monthKey(t.date)
    if (f.from && mk < f.from) return false
    if (f.to && mk > f.to) return false
    return true
  })
}

export interface Kpis {
  income: Paise
  spend: Paise
  invested: Paise
  refunds: Paise
  /** income - spend (investments count as saved) */
  net: Paise
  savingsRate: number | null
  selfTransfers: number
}

/** Spend per category, with refunds netted against the category they came back to. */
export function spendByCategory(txns: EnrichedTxn[]): { category: CategoryId; amount: Paise; count: number }[] {
  const amount = new Map<CategoryId, number>()
  const count = new Map<CategoryId, number>()
  for (const t of txns) {
    if (t.debit > 0 && isSpend(t.category)) {
      amount.set(t.category, (amount.get(t.category) ?? 0) + t.debit)
      count.set(t.category, (count.get(t.category) ?? 0) + 1)
    } else if (t.credit > 0 && t.category === 'refunds' && t.netAgainst) {
      amount.set(t.netAgainst, (amount.get(t.netAgainst) ?? 0) - t.credit)
    }
  }
  return SPEND_CATEGORIES.map((c) => ({ category: c, amount: Math.max(0, amount.get(c) ?? 0), count: count.get(c) ?? 0 }))
    .filter((r) => r.amount > 0 || r.count > 0)
    .sort((a, b) => b.amount - a.amount)
}

export function kpis(txns: EnrichedTxn[]): Kpis {
  let income = 0
  let invested = 0
  let refundsUnmatched = 0
  let refunds = 0
  let selfTransfers = 0
  for (const t of txns) {
    if (t.category === 'self') {
      selfTransfers++
      continue
    }
    if (t.credit > 0) {
      if (t.category === 'refunds') {
        refunds += t.credit
        if (!t.netAgainst) refundsUnmatched += t.credit
      } else if (CATEGORY_BY_ID[t.category]?.kind === 'income') income += t.credit
    }
    if (t.debit > 0 && t.category === 'investments') invested += t.debit
  }
  // Unmatched refunds still reduce what was spent overall.
  const spend = Math.max(0, spendByCategory(txns).reduce((n, r) => n + r.amount, 0) - refundsUnmatched)
  const net = income - spend
  return { income, spend, invested, refunds, net, savingsRate: income > 0 ? net / income : null, selfTransfers }
}

export function monthsIn(txns: EnrichedTxn[]): string[] {
  return [...new Set(txns.map((t) => monthKey(t.date)))].sort()
}

export interface MonthPoint {
  month: string
  income: Paise
  spend: Paise
  invested: Paise
}

export function monthlySeries(txns: EnrichedTxn[]): MonthPoint[] {
  const byMonth = new Map<string, EnrichedTxn[]>()
  for (const t of txns) {
    const mk = monthKey(t.date)
    let list = byMonth.get(mk)
    if (!list) byMonth.set(mk, (list = []))
    list.push(t)
  }
  return [...byMonth.keys()].sort().map((month) => {
    const k = kpis(byMonth.get(month)!)
    return { month, income: k.income, spend: k.spend, invested: k.invested }
  })
}

/** category -> month -> spend */
export function categoryByMonth(txns: EnrichedTxn[]): { months: string[]; rows: { category: CategoryId; values: Paise[]; total: Paise }[] } {
  const months = monthsIn(txns)
  const rows = SPEND_CATEGORIES.map((category) => ({ category, values: months.map(() => 0), total: 0 }))
  const idx = new Map(rows.map((r, i) => [r.category, i]))
  for (const m of months) {
    const mi = months.indexOf(m)
    for (const r of spendByCategory(txns.filter((t) => monthKey(t.date) === m))) {
      rows[idx.get(r.category)!].values[mi] = r.amount
    }
  }
  for (const r of rows) r.total = r.values.reduce((a, b) => a + b, 0)
  return { months, rows: rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total) }
}

export interface CompareRow {
  category: CategoryId
  a: Paise
  b: Paise
  delta: Paise
  /** null when A is zero (percent change undefined) */
  pct: number | null
}

export function compare(aTxns: EnrichedTxn[], bTxns: EnrichedTxn[]): CompareRow[] {
  const a = new Map(spendByCategory(aTxns).map((r) => [r.category, r.amount]))
  const b = new Map(spendByCategory(bTxns).map((r) => [r.category, r.amount]))
  const cats = SPEND_CATEGORIES.filter((c) => (a.get(c) ?? 0) > 0 || (b.get(c) ?? 0) > 0)
  return cats
    .map((category) => {
      const av = a.get(category) ?? 0
      const bv = b.get(category) ?? 0
      return { category, a: av, b: bv, delta: bv - av, pct: av > 0 ? (bv - av) / av : null }
    })
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b))
}

export function byAccount(txns: EnrichedTxn[]): { accountKey: string; total: Paise; byCategory: Map<CategoryId, Paise> }[] {
  const accounts = [...new Set(txns.map((t) => t.accountKey))]
  return accounts.map((accountKey) => {
    const rows = spendByCategory(txns.filter((t) => t.accountKey === accountKey))
    return {
      accountKey,
      total: rows.reduce((n, r) => n + r.amount, 0),
      byCategory: new Map(rows.map((r) => [r.category, r.amount])),
    }
  })
}

export function topPayees(txns: EnrichedTxn[], n = 10) {
  const m = new Map<string, { payeeKey: string; name: string; category: CategoryId; amount: Paise; count: number }>()
  for (const t of txns) {
    if (t.debit <= 0 || !isSpend(t.category)) continue
    const cur = m.get(t.payeeKey) ?? { payeeKey: t.payeeKey, name: t.payeeName, category: t.category, amount: 0, count: 0 }
    cur.amount += t.debit
    cur.count++
    m.set(t.payeeKey, cur)
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, n)
}
