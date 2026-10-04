import { useMemo, useState } from 'react'
import type { ColumnMapping } from '../engine/gridView'
import { formatDay } from '../engine/dates'
import { formatINR } from '../engine/money'
import { bestMapping, checkMapping } from '../engine/parse'
import type { Role } from '../engine/profiles'
import { useStore, type MappingTarget } from '../store'
import { Button, Dialog, StatusPill } from './ui'

const ROLE_OPTIONS: { value: Role | ''; label: string }[] = [
  { value: '', label: 'Ignore' },
  { value: 'date', label: 'Date' },
  { value: 'narration', label: 'Description' },
  { value: 'debit', label: 'Money out' },
  { value: 'credit', label: 'Money in' },
  { value: 'amount', label: 'Amount' },
  { value: 'drcr', label: 'Dr / Cr' },
  { value: 'balance', label: 'Balance' },
  { value: 'ref', label: 'Reference' },
  { value: 'valueDate', label: 'Value date' },
]

const PREVIEW_ROWS = 12

/**
 * "Fix columns": show the statement as a table and let the user say which column is which.
 * Every change is re-checked against the running balance on the spot, on this device.
 */
export function MapColumns() {
  const target = useStore((s) => s.mappingTarget)
  const close = useStore((s) => s.openMapping)
  if (!target) return <Dialog open={false} onClose={() => close(null)} title="Fix columns">{null}</Dialog>
  // Keyed by target, so each file starts from its own best guess.
  return <MapColumnsDialog key={`${target.id}:${target.view.fingerprint}`} target={target} />
}

function MapColumnsDialog({ target }: { target: MappingTarget }) {
  const close = useStore((s) => s.openMapping)
  const apply = useStore((s) => s.applyMapping)
  const remember = useStore((s) => s.rememberRules)
  const view = target.view
  const [mapping, setMapping] = useState<ColumnMapping>(() => bestMapping(view))
  const [name, setName] = useState(target.bankName && target.bankName !== 'Bank statement' ? target.bankName : '')
  const [save, setSave] = useState(true)
  const width = useMemo(() => view.rows.reduce((n, r) => Math.max(n, r.length), 0), [view])
  const check = useMemo(() => checkMapping(view, mapping, target.fileName), [view, mapping, target.fileName])

  const roles = mapping.roles
  const hasDate = roles.includes('date')
  const hasMoney = roles.includes('debit') || roles.includes('credit') || roles.includes('amount')
  const start = mapping.headerRow === null ? 0 : mapping.headerRow + 1
  const preview = view.rows.slice(start).filter((r) => r.some(Boolean)).slice(0, PREVIEW_ROWS)
  const titles = mapping.headerRow === null ? [] : view.rows[mapping.headerRow]

  const setRole = (col: number, role: Role | '') => {
    const next = [...roles]
    // One column per role, except Description, which may span several columns.
    if (role && role !== 'narration') next.forEach((r, i) => i !== col && r === role && (next[i] = null))
    next[col] = role || null
    setMapping({ ...mapping, roles: next })
  }

  const rate = check.rate
  return (
    <Dialog
      open
      xl
      onClose={() => close(null)}
      title={`Fix columns · ${target.fileName}`}
      footer={
        <>
          <Button onClick={() => close(null)}>Cancel</Button>
          <Button variant="primary" disabled={!check.ok || !hasDate || !hasMoney} onClick={() => apply(target, mapping, { save, name })}>
            Use these columns
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-ink-2">
          Tell KharchaLens what each column holds. The guesses are filled in; change any that are wrong. Everything is checked against the running balance right here on
          your device.
        </p>

        {view.kind === 'sheet' && (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Column titles are on
            <select
              value={mapping.headerRow ?? ''}
              onChange={(e) => setMapping({ ...mapping, headerRow: e.target.value === '' ? null : Number(e.target.value) })}
              className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            >
              <option value="">No title row</option>
              {view.rows.slice(0, 40).map((r, i) =>
                r.some(Boolean) ? (
                  <option key={i} value={i}>
                    Row {i + 1}: {r.filter(Boolean).slice(0, 4).join(' · ').slice(0, 60)}
                  </option>
                ) : null,
              )}
            </select>
          </label>
        )}

        <section aria-live="polite" className="rounded-2xl bg-surface-2 p-4">
          {!hasDate || !hasMoney ? (
            <p className="text-sm text-ink-2">Pick at least a Date column and one money column (debit/credit, or a single amount).</p>
          ) : !check.ok ? (
            <p className="text-sm text-ink-2">{check.message ?? 'No transactions found with these columns yet.'}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-ink">{check.count} transactions read</span>
                {rate === null ? (
                  <StatusPill tone="neutral">No balance column to check</StatusPill>
                ) : rate >= 0.99 ? (
                  <StatusPill tone="good">Balances check out ({Math.round(rate * 100)}%)</StatusPill>
                ) : (
                  <StatusPill tone={rate >= 0.95 ? 'warning' : 'critical'}>Only {Math.round(rate * 100)}% of balances check out</StatusPill>
                )}
              </div>
              {rate !== null && rate < 0.95 && (
                <p className="mt-1 text-xs text-muted">Often this means Money in and Money out are swapped, or the Balance column is wrong.</p>
              )}
              <ul className="mt-3 space-y-1 text-xs">
                {check.result!.txns.slice(0, 5).map((t) => (
                  <li key={t.id} className="flex gap-3">
                    <span className="tabular w-24 shrink-0 text-muted">{formatDay(t.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{t.narration}</span>
                    <span className={`tabular shrink-0 font-medium ${t.credit ? 'text-pos' : 'text-ink'}`}>
                      {t.credit ? `+${formatINR(t.credit, true)}` : `−${formatINR(t.debit, true)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="min-w-full text-xs">
            <thead className="bg-surface-2">
              <tr>
                {Array.from({ length: width }, (_, i) => (
                  <th key={i} scope="col" className="min-w-[112px] p-2 text-left align-top font-normal">
                    <select
                      aria-label={`Column ${i + 1}${titles[i] ? ` (${titles[i]})` : ''}`}
                      value={roles[i] ?? ''}
                      onChange={(e) => setRole(i, e.target.value as Role | '')}
                      className={`w-full rounded-lg border px-2 py-1.5 text-xs font-medium ${roles[i] ? 'border-brand bg-brand-soft text-brand-text' : 'border-line bg-surface text-muted'}`}
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 truncate text-[11px] text-muted" title={titles[i]}>
                      {titles[i] || `Column ${i + 1}`}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, ri) => (
                <tr key={ri} className="border-t border-line">
                  {Array.from({ length: width }, (_, i) => (
                    <td key={i} className={`max-w-[220px] truncate p-2 ${roles[i] ? 'text-ink' : 'text-muted'}`} title={r[i]}>
                      {r[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>



        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Bank name (optional)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kotak, my co-op bank"
              className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            />
          </label>
          <label className="flex items-start gap-2 self-end rounded-xl p-2 text-sm text-ink">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
            <span>
              Use this layout for my next statements
              <span className="block text-xs text-muted">
                {remember ? 'Saved on this device — only column titles, never your data.' : 'For this visit. Turn on “Remember my rules” in Privacy to keep it.'}
              </span>
            </span>
          </label>
        </div>
      </div>
    </Dialog>
  )
}
