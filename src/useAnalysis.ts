import { useMemo } from 'react'
import { applyFilter, spendByCategory } from './engine/aggregate'
import { analyze, type Analysis } from './engine/analyze'
import { mergeResults } from './engine/merge'
import type { CategoryId, EnrichedTxn, Statement } from './engine/types'
import { SLOTS } from './components/categoryVisuals'
import { useStore } from './store'

export interface AccountInfo {
  key: string
  label: string
  short: string
  bankName: string
}

export interface Derived extends Analysis {
  statements: Statement[]
  duplicates: number
  accounts: AccountInfo[]
  months: string[]
  /** Transactions after the account + month filter. */
  filtered: EnrichedTxn[]
  /** Chart color per category: fixed from the whole dataset, never re-ranked by filters. */
  colorOf: (c: CategoryId) => string
  /** The (up to) seven categories that get their own color; the rest are "Other". */
  colored: CategoryId[]
}

/** Everything the views need, recomputed only when data, rules or filters change. */
export function useAnalysis(): Derived {
  const results = useStore((s) => s.results)
  const rules = useStore((s) => s.rules)
  const filter = useStore((s) => s.filter)

  const base = useMemo(() => {
    const merged = mergeResults(results)
    const analysis = analyze(merged.txns, merged.statements, rules)
    const seen = new Map<string, AccountInfo>()
    for (const s of merged.statements) {
      if (seen.has(s.accountKey)) continue
      const short = s.accountLast4 ? `••${s.accountLast4}` : s.fileName.replace(/\.[^.]+$/, '').slice(0, 18)
      seen.set(s.accountKey, { key: s.accountKey, short, bankName: s.bankName, label: `${s.bankName} ${short}` })
    }
    const months = [...new Set(analysis.txns.map((t) => t.date.slice(0, 7)))].sort()
    const colored = spendByCategory(analysis.txns)
      .slice(0, SLOTS.length)
      .map((r) => r.category)
    const colorOf = (c: CategoryId) => {
      const i = colored.indexOf(c)
      return i >= 0 ? `var(${SLOTS[i]})` : 'var(--series-other)'
    }
    return { ...analysis, statements: merged.statements, duplicates: merged.duplicates, accounts: [...seen.values()], months, colored, colorOf }
  }, [results, rules])

  const filtered = useMemo(() => applyFilter(base.txns, filter), [base.txns, filter])
  return { ...base, filtered }
}
