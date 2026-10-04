import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { categoryLabel } from '../engine/categories'
import { formatINR } from '../engine/money'
import type { CategoryId } from '../engine/types'
import { CategoryIcon } from '../components/categoryVisuals'
import { Tooltip, TipRow, useWidth, type TipState } from './common'

export interface CatRow {
  category: CategoryId
  amount: number
  count: number
}

/**
 * Part-to-whole: one thick stacked bar (top categories in fixed color slots, the rest as
 * "Other", 2px surface gaps) above a labelled list. Identity is carried by the label and
 * icon in the list, never by color alone.
 */
export function SpendBreakdown({
  rows,
  total,
  colored,
  colorOf,
  onSelect,
  listLimit,
}: {
  rows: CatRow[]
  total: number
  colored: CategoryId[]
  colorOf: (c: CategoryId) => string
  onSelect?: (c: CategoryId) => void
  /** Show only the biggest N categories in the list (the bar still shows all). */
  listLimit?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const coloredRows = colored.map((c) => rows.find((r) => r.category === c)).filter((r): r is CatRow => !!r && r.amount > 0)
  const other = rows.filter((r) => !colored.includes(r.category)).reduce((n, r) => n + r.amount, 0)
  const segments = [
    ...coloredRows.map((r) => ({ key: r.category as string, label: categoryLabel(r.category), value: r.amount, color: colorOf(r.category) })),
    ...(other > 0 ? [{ key: 'other', label: 'Everything else', value: other, color: 'var(--series-other)' }] : []),
  ]

  return (
    <div>
      <div ref={ref} className="relative" onMouseLeave={() => setTip(null)}>
        <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`Spending split: ${segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}`}>
          {segments.map((s) => (
            <span
              key={s.key}
              className="h-full min-w-[4px]"
              style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
              onMouseMove={(e) => {
                const box = ref.current!.getBoundingClientRect()
                setTip({
                  x: e.clientX - box.left,
                  y: 8,
                  content: (
                    <div className="space-y-1">
                      <TipRow label={s.label} value={formatINR(s.value)} swatch={s.color} />
                      <TipRow label="Share" value={`${((s.value / total) * 100).toFixed(1)}%`} />
                    </div>
                  ),
                })
              }}
            />
          ))}
        </div>
        <Tooltip tip={tip} width={width} />
      </div>

      <ul className="mt-5 divide-y divide-line">
        {rows.slice(0, listLimit ?? rows.length).map((r) => {
          const share = total ? (r.amount / total) * 100 : 0
          return (
            <li key={r.category}>
              <button
                type="button"
                disabled={!onSelect}
                onClick={() => onSelect?.(r.category)}
                className="group flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left transition hover:bg-surface-2 sm:px-2"
                aria-label={`${categoryLabel(r.category)}: ${formatINR(r.amount)}, ${share.toFixed(0)} percent of spending, ${r.count} payments`}
              >
                <CategoryIcon id={r.category} color={colorOf(r.category)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{categoryLabel(r.category)}</span>
                  <span className="block text-xs text-muted">
                    {r.count} payment{r.count === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="text-right">
                  <span className="tabular block text-sm font-semibold text-ink">{formatINR(r.amount)}</span>
                  <span className="tabular block text-xs text-muted">{share < 1 ? '<1' : Math.round(share)}%</span>
                </span>
                {onSelect && <ChevronRight size={16} aria-hidden className="text-muted opacity-0 transition group-hover:opacity-100" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
