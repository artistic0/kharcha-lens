import { Building2, Trash } from 'lucide-react'
import { formatDay } from '../engine/dates'
import { Dropzone } from '../components/Dropzone'
import { Jobs } from '../components/Jobs'
import { Button, StatusPill } from '../components/ui'
import { useStore } from '../store'
import type { Derived } from '../useAnalysis'

export function Files({ d }: { d: Derived }) {
  const remove = useStore((s) => s.removeStatement)
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {d.duplicates > 0 && (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm text-ink-2">
            {d.duplicates} transaction{d.duplicates === 1 ? ' appears' : 's appear'} in more than one statement of the same account and {d.duplicates === 1 ? 'was' : 'were'} counted once.
          </p>
        )}
        <ul className="space-y-3">
          {d.statements.map((s) => {
            const rate = s.reconcileRate
            return (
              <li key={s.id} className="card p-5">
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-text" aria-hidden>
                    <Building2 size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink">{s.fileName}</div>
                    <div className="text-sm text-muted">
                      {s.bankName}
                      {s.accountLast4 ? ` · ••${s.accountLast4}` : ''}
                      {s.holderName ? ` · ${s.holderName}` : ''}
                    </div>
                    <div className="mt-0.5 text-sm text-muted">
                      {s.from && s.to ? `${formatDay(s.from)} – ${formatDay(s.to)}` : ''} · {s.rowCount} transactions
                    </div>
                    <div className="mt-3">
                      {rate === null ? (
                        <StatusPill tone="neutral">No balance column to check</StatusPill>
                      ) : rate >= 0.99 ? (
                        <StatusPill tone="good">Balances check out ({Math.round(rate * 100)}%)</StatusPill>
                      ) : rate >= 0.95 ? (
                        <StatusPill tone="warning">{Math.round(rate * 100)}% of balances check out</StatusPill>
                      ) : (
                        <StatusPill tone="critical">Only {Math.round(rate * 100)}% of balances check out</StatusPill>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => remove(s.id)} aria-label={`Remove ${s.fileName}`}>
                    <Trash size={16} aria-hidden />
                    <span className="hidden sm:inline">Remove</span>
                  </Button>
                </div>
                {s.warnings.length > 0 && (
                  <ul className="mt-3 list-disc space-y-0.5 rounded-xl bg-surface-2 py-2 pr-3 pl-8 text-sm text-ink-2">
                    {s.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                    {s.failedRows.length > 0 && (
                      <li>
                        Rows that didn’t add up: {s.failedRows.slice(0, 20).join(', ')}
                        {s.failedRows.length > 20 ? '…' : ''}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <div className="space-y-3">
        <Dropzone size="md" />
        <Jobs />
      </div>
    </div>
  )
}
