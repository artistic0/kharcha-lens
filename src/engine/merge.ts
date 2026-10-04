import type { ParseResult, Statement, Txn } from './types'

const narrationKey = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 48)

/**
 * Combine parsed statements. Two statements of the same account that overlap (Jul–Aug and
 * Aug–Sep) would double-count August, so a row already seen in a *different* statement of
 * the same account is dropped. Identical rows inside one statement are kept: two ₹20 teas
 * on the same day are both real.
 */
export function mergeResults(results: ParseResult[]): { statements: Statement[]; txns: Txn[]; duplicates: number } {
  const seen = new Map<string, string>()
  const txns: Txn[] = []
  let duplicates = 0
  for (const { statement, txns: list } of results) {
    for (const t of list) {
      const key = [t.accountKey, t.date, t.debit, t.credit, t.balance ?? '', narrationKey(t.narration)].join('|')
      const owner = seen.get(key)
      if (owner && owner !== statement.id) {
        duplicates++
        continue
      }
      seen.set(key, statement.id)
      txns.push(t)
    }
  }
  txns.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { statements: results.map((r) => r.statement), txns, duplicates }
}
