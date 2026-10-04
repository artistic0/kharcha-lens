import { useState } from 'react'
import { formatINR } from '../engine/money'
import type { CategoryId } from '../engine/types'
import { CategoryIcon } from '../components/categoryVisuals'
import { Legend, Tooltip, TipRow, useWidth, type TipState } from './common'

export interface DumbbellRow {
  key: CategoryId
  label: string
  a: number
  b: number
}

/** Before → after per category: two shades of one hue joined by a line. */
export function Dumbbell({ rows, aLabel, bLabel, colorOf }: { rows: DumbbellRow[]; aLabel: string; bLabel: string; colorOf: (c: CategoryId) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]))
  const pos = (v: number) => `${(v / max) * 100}%`

  const show = (e: React.MouseEvent | React.FocusEvent, r: DumbbellRow) => {
    const box = ref.current!.getBoundingClientRect()
    const t = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const delta = r.b - r.a
    setTip({
      x: 'clientX' in e ? e.clientX - box.left : t.left - box.left + t.width / 2,
      y: t.top - box.top + t.height / 2,
      content: (
        <div className="space-y-1">
          <div className="font-medium">{r.label}</div>
          <TipRow label={aLabel} value={formatINR(r.a)} swatch="var(--pair-a)" />
          <TipRow label={bLabel} value={formatINR(r.b)} swatch="var(--pair-b)" />
          <TipRow label="Change" value={`${delta >= 0 ? '+' : '−'}${formatINR(Math.abs(delta))}`} />
        </div>
      ),
    })
  }

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setTip(null)}>
      <Legend
        items={[
          { label: aLabel, color: 'var(--pair-a)', shape: 'dot' },
          { label: bLabel, color: 'var(--pair-b)', shape: 'dot' },
        ]}
      />
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const lo = Math.min(r.a, r.b)
          const hi = Math.max(r.a, r.b)
          const delta = r.b - r.a
          const pct = r.a > 0 ? Math.round((delta / r.a) * 100) : null
          const up = delta > 0
          return (
            <li
              key={r.key}
              tabIndex={0}
              onMouseMove={(e) => show(e, r)}
              onFocus={(e) => show(e, r)}
              onBlur={() => setTip(null)}
              aria-label={`${r.label}: ${aLabel} ${formatINR(r.a)}, ${bLabel} ${formatINR(r.b)}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(150px,220px)_1fr_120px]"
            >
              <span className="flex min-w-0 items-center gap-3">
                <CategoryIcon id={r.key} color={colorOf(r.key)} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                  <span className="tabular block text-xs text-muted">
                    {formatINR(r.a)} → {formatINR(r.b)}
                  </span>
                </span>
              </span>
              <span className="relative order-3 col-span-2 h-5 sm:order-none sm:col-span-1" aria-hidden>
                <span className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-surface-2" />
                <span className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})`, background: 'var(--axis)' }} />
                <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface)]" style={{ left: pos(r.a), background: 'var(--pair-a)' }} />
                <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface)]" style={{ left: pos(r.b), background: 'var(--pair-b)' }} />
              </span>
              <span className="tabular text-right text-sm">
                {delta === 0 ? (
                  <span className="text-muted">no change</span>
                ) : (
                  <span className="font-semibold text-ink">
                    <span aria-hidden>{up ? '▲' : '▼'} </span>
                    <span className="sr-only">{up ? 'up' : 'down'} </span>
                    {formatINR(Math.abs(delta))}
                    <span className="block text-xs font-normal text-muted">{pct === null ? 'new' : `${up ? '+' : '−'}${Math.abs(pct)}%`}</span>
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}
