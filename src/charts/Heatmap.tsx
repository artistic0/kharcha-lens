import { useState } from 'react'
import { formatMonth, formatMonthShort } from '../engine/dates'
import { formatINR, formatINRCompact } from '../engine/money'
import { Tooltip, TipRow, useWidth, type TipState } from './common'

const STEPS = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600', '--seq-700']

/** Category × month grid, sequential blue (one hue, more is darker). It is a real table. */
export function Heatmap({
  months,
  rows,
}: {
  months: string[]
  rows: { key: string; label: string; values: number[] }[]
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const max = Math.max(1, ...rows.flatMap((r) => r.values))
  const step = (v: number) => (v <= 0 ? -1 : Math.min(STEPS.length - 1, Math.floor((v / max) * STEPS.length)))

  const show = (e: React.MouseEvent | React.FocusEvent, label: string, month: string, v: number, rowTotal: number) => {
    const box = ref.current!.getBoundingClientRect()
    const t = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTip({
      x: t.left - box.left + t.width / 2,
      y: t.top - box.top + t.height / 2,
      content: (
        <div className="space-y-1">
          <div className="font-medium">
            {label} · {formatMonth(month)}
          </div>
          <TipRow label="Spent" value={formatINR(v)} />
          <TipRow label="Share of this category" value={`${rowTotal ? Math.round((v / rowTotal) * 100) : 0}%`} />
        </div>
      ),
    })
  }

  return (
    <div ref={ref} className="relative overflow-x-auto" onMouseLeave={() => setTip(null)}>
      <table className="w-full border-separate text-sm" style={{ borderSpacing: 4 }}>
        <caption className="sr-only">Spending by category and month</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-surface text-left text-xs font-medium text-muted">
              Category
            </th>
            {months.map((m) => (
              <th key={m} scope="col" className="min-w-[72px] text-center text-xs font-medium text-muted">
                {formatMonthShort(m)}
                <span className="sr-only"> {m.slice(0, 4)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = r.values.reduce((a, b) => a + b, 0)
            return (
              <tr key={r.key}>
                <th scope="row" className="sticky left-0 max-w-[170px] truncate bg-surface pr-3 text-left text-sm font-medium text-ink">
                  {r.label}
                </th>
                {r.values.map((v, i) => {
                  const s = step(v)
                  const dark = s >= 4
                  return (
                    <td
                      key={months[i]}
                      tabIndex={0}
                      onMouseMove={(e) => show(e, r.label, months[i], v, total)}
                      onFocus={(e) => show(e, r.label, months[i], v, total)}
                      onBlur={() => setTip(null)}
                      className="tabular h-11 rounded-lg px-1.5 text-center text-xs font-medium"
                      style={{
                        background: s < 0 ? 'var(--seq-zero)' : `var(${STEPS[s]})`,
                        color: s < 0 ? 'var(--muted)' : dark ? '#ffffff' : '#0b0b0b',
                      }}
                    >
                      {v > 0 ? formatINRCompact(v) : '–'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}
