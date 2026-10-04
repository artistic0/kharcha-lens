import { enrich } from './categorize'
import { detectRecurring, type RecurringItem } from './recurring'
import type { EnrichedTxn, Statement, Txn, UserRules } from './types'

export interface Analysis {
  txns: EnrichedTxn[]
  recurring: RecurringItem[]
}

/** Everything derived from the parsed data and the user's rules. Pure, cheap to re-run. */
export function analyze(txns: Txn[], statements: Statement[], rules: UserRules): Analysis {
  const enriched = enrich(txns, statements, rules)
  const dataEnd = new Map<string, string>()
  for (const s of statements) {
    if (!s.to) continue
    const cur = dataEnd.get(s.accountKey)
    if (!cur || s.to > cur) dataEnd.set(s.accountKey, s.to)
  }
  const { items, byTxn } = detectRecurring(enriched, dataEnd)
  for (const t of enriched) t.recurringId = byTxn.get(t.id)
  return { txns: enriched, recurring: items }
}
