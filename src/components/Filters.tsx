import { formatMonth } from '../engine/dates'
import { useStore } from '../store'
import type { Derived } from '../useAnalysis'
import { PillSelect } from './ui'

/** Account + period filters. Native selects: accessible and comfortable on phones. */
export function Filters({ d }: { d: Derived }) {
  const filter = useStore((s) => s.filter)
  const setFilter = useStore((s) => s.setFilter)
  const period = filter.from && filter.from === filter.to ? filter.from : 'all'
  const account = filter.accounts?.length === 1 ? filter.accounts[0] : 'all'
  const span = d.months.length > 1 ? `${formatMonth(d.months[0])} – ${formatMonth(d.months[d.months.length - 1])}` : formatMonth(d.months[0] ?? '')

  return (
    <div className="flex flex-wrap items-end gap-2">
      {d.accounts.length > 1 && (
        <PillSelect label="Account" hideLabel value={account} onChange={(v) => setFilter({ accounts: v === 'all' ? null : [v] })}>
          <option value="all">All accounts</option>
          {d.accounts.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </PillSelect>
      )}
      {d.months.length > 1 && (
        <PillSelect
          label="Period"
          hideLabel
          value={period}
          onChange={(v) => setFilter(v === 'all' ? { from: undefined, to: undefined } : { from: v, to: v })}
        >
          <option value="all">All months · {span}</option>
          {[...d.months].reverse().map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </PillSelect>
      )}
    </div>
  )
}

export function periodLabel(d: Derived, filter: { from?: string; to?: string }) {
  if (filter.from && filter.from === filter.to) return formatMonth(filter.from)
  if (d.months.length > 1) return `${formatMonth(d.months[0])} – ${formatMonth(d.months[d.months.length - 1])}`
  return formatMonth(d.months[0] ?? '')
}
