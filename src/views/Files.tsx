import { Building2, Columns3, ScanSearch, Trash } from 'lucide-react'
import { useState } from 'react'
import { Inspector } from '../components/Inspector'
import { formatDay } from '../engine/dates'
import { PROFILE_BY_ID } from '../engine/profiles'
import { Dropzone } from '../components/Dropzone'
import { Jobs } from '../components/Jobs'
import { Button, StatusPill } from '../components/ui'
import { useStore } from '../store'
import type { Derived } from '../useAnalysis'

export function Files({ d }: { d: Derived }) {
  const remove = useStore((s) => s.removeStatement)
  const results = useStore((s) => s.results)
  const openMapping = useStore((s) => s.openMapping)
  const [inspectId, setInspectId] = useState<string | null>(null)
  const resultOf = (id: string) => results.find((r) => r.statement.id === id) ?? null
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
                      {PROFILE_BY_ID[s.bank]?.beta && (
                        <span className="ml-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text" title="New bank layout: check the balance score below">
                          beta
                        </span>
                      )}
                      {s.accountLast4 ? ` · ••${s.accountLast4}` : ''}
                      {s.holderName ? ` · ${s.holderName}` : ''}
                    </div>
                    <div className="mt-0.5 text-sm text-muted">
                      {s.from && s.to ? `${formatDay(s.from)} – ${formatDay(s.to)}` : ''} · {s.rowCount} transactions
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(rate === null || rate < 0.95) && resultOf(s.id)?.view && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openMapping({ id: s.id, fileName: s.fileName, view: resultOf(s.id)!.view!, bankName: s.bankName })}
                        >
                          <Columns3 size={14} aria-hidden /> Fix columns
                        </Button>
                      )}
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
                  <div className="flex flex-col items-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setInspectId(s.id)} aria-label={`Inspect ${s.fileName}`}>
                      <ScanSearch size={15} aria-hidden />
                      <span className="hidden sm:inline">Inspect</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(s.id)} aria-label={`Remove ${s.fileName}`}>
                      <Trash size={15} aria-hidden />
                      <span className="hidden sm:inline">Remove</span>
                    </Button>
                  </div>
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
      <Inspector result={inspectId ? resultOf(inspectId) : null} open={!!inspectId} onClose={() => setInspectId(null)} />
    </div>
  )
}
