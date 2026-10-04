import { useState } from 'react'
import { parseLeadingDate } from '../engine/dates'
import { formatDay } from '../engine/dates'
import { formatINR } from '../engine/money'
import { anonymize, layoutText } from '../engine/parse'
import { PROFILE_BY_ID } from '../engine/profiles'
import type { ParseResult } from '../engine/types'
import { useStore } from '../store'
import { Button, Sheet, StatusPill } from './ui'

const ROLE_LABEL: Record<string, string> = {
  date: 'Date',
  valueDate: 'Value date',
  narration: 'Description',
  ref: 'Reference',
  debit: 'Money out',
  credit: 'Money in',
  amount: 'Amount',
  drcr: 'Dr / Cr',
  balance: 'Balance',
  serial: 'Serial no.',
}

/** How the reader understood a statement: bank, columns, and the rows that didn't add up. */
export function Inspector({ result, open, onClose }: { result: ParseResult | null; open: boolean; onClose: () => void }) {
  const openMapping = useStore((s) => s.openMapping)
  const [copied, setCopied] = useState(false)
  if (!result) return <Sheet open={false} onClose={onClose} title="Inspect">{null}</Sheet>
  const { statement: s, view } = result
  const rate = s.reconcileRate
  const failed = (s.failedTxnIds ?? []).map((id) => result.txns.find((t) => t.id === id)).filter((t) => !!t)

  const width = view ? view.rows.reduce((n, r) => Math.max(n, r.length), 0) : 0
  const titles = view && view.headerRow !== null ? view.rows[view.headerRow] : []
  // First non-empty value of each column among the dated rows.
  const dated = view ? view.rows.filter((r) => r.some((c) => parseLeadingDate(c))).slice(0, 200) : []
  const exampleOf = (i: number) => dated.find((r) => (r[i] ?? '').trim())?.[i] ?? ''

  return (
    <Sheet open={open} onClose={onClose} title={`Inspect · ${s.fileName}`}>
      <div className="space-y-5 text-sm">
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-xs text-muted">Read as</dt>
            <dd className="font-semibold text-ink">{s.bankName}</dd>
            <dd className="text-xs text-muted">{s.bank === 'custom' ? 'Your saved layout' : s.bank === 'generic' ? 'Generic reader' : PROFILE_BY_ID[s.bank]?.beta ? 'Built-in profile (beta)' : 'Built-in profile'}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-xs text-muted">Balance check</dt>
            <dd className="mt-1">
              {rate === null ? (
                <StatusPill tone="neutral">No balance column</StatusPill>
              ) : rate >= 0.99 ? (
                <StatusPill tone="good">{Math.round(rate * 100)}% check out</StatusPill>
              ) : (
                <StatusPill tone={rate >= 0.95 ? 'warning' : 'critical'}>{Math.round(rate * 100)}% check out</StatusPill>
              )}
            </dd>
            <dd className="mt-1 text-xs text-muted">{s.rowCount} transactions</dd>
          </div>
        </dl>

        {view ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Columns</h3>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="min-w-full text-xs">
                <thead className="bg-surface-2 text-left text-muted">
                  <tr>
                    <th scope="col" className="p-2 font-medium">#</th>
                    <th scope="col" className="p-2 font-medium">Title</th>
                    <th scope="col" className="p-2 font-medium">Read as</th>
                    <th scope="col" className="p-2 font-medium">Example</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: width }, (_, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="p-2 text-muted">{i + 1}</td>
                      <td className="max-w-[110px] truncate p-2 text-ink" title={titles[i]}>
                        {titles[i] || '—'}
                      </td>
                      <td className="p-2">
                        {view.roles[i] ? <span className="font-medium text-brand-text">{ROLE_LABEL[view.roles[i]!] ?? view.roles[i]}</span> : <span className="text-muted">ignored</span>}
                      </td>
                      <td className="max-w-[140px] truncate p-2 text-ink-2" title={exampleOf(i)}>
                        {exampleOf(i)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <p className="text-muted">This statement has no layout details (sample data).</p>
        )}

        {failed.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Rows that don’t add up ({failed.length})</h3>
            <ul className="space-y-1 text-xs">
              {failed.slice(0, 10).map((t) => (
                <li key={t.id} className="flex gap-3 rounded-lg bg-surface-2 px-2 py-1.5">
                  <span className="tabular w-24 shrink-0 text-muted">{formatDay(t.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{t.narration}</span>
                  <span className="tabular shrink-0">{t.credit ? `+${formatINR(t.credit, true)}` : `−${formatINR(t.debit, true)}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {view && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                onClose()
                openMapping({ id: s.id, fileName: s.fileName, view, bankName: s.bankName })
              }}
            >
              Fix columns
            </Button>
            <Button onClick={() => void navigator.clipboard?.writeText(anonymize(layoutText(view))).then(() => setCopied(true))}>
              {copied ? 'Copied' : 'Copy anonymized layout'}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted">The anonymized layout replaces every letter with “A/a” and every digit with “9”, so it can be shared to get a bank supported.</p>
      </div>
    </Sheet>
  )
}
