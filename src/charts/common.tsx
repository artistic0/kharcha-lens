import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Track an element's width so SVG charts can draw at real pixel size. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    setW(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export interface TipState {
  x: number
  y: number
  content: ReactNode
}

/** Hover/focus tooltip positioned inside a relative container; flips to stay in view. */
export function Tooltip({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x, 8), Math.max(8, width - 8))
  const alignRight = left > width * 0.6
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 max-w-[260px] rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink shadow-xl"
      style={{
        left,
        top: tip.y,
        transform: `translate(${alignRight ? 'calc(-100% - 10px)' : '10px'}, -50%)`,
      }}
    >
      {tip.content}
    </div>
  )
}

export function TipRow({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-ink-2">
        {swatch && <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: swatch }} />}
        {label}
      </span>
      <span className="tabular font-medium text-ink">{value}</span>
    </div>
  )
}

/** A card whose chart can flip to a plain table, so every number is reachable without color. */
export function ChartCard({ title, subtitle, table, children }: { title: string; subtitle?: ReactNode; table: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className="card p-5 sm:p-6" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <button type="button" onClick={() => setAsTable(!asTable)} className="rounded-lg px-2 py-1 text-xs font-medium text-brand-text hover:bg-surface-2">
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {asTable ? <div className="overflow-x-auto">{table}</div> : children}
    </section>
  )
}

export function DataTable({ head, rows, align }: { head: string[]; rows: ReactNode[][]; align?: ('l' | 'r')[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-muted">
          {head.map((h, i) => (
            <th key={h} scope="col" className={`py-2 pr-3 font-medium ${align?.[i] === 'r' ? 'text-right' : ''}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-line last:border-0">
            {r.map((c, ci) => (
              <td key={ci} className={`py-2 pr-3 ${align?.[ci] === 'r' ? 'tabular text-right' : ''}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Legend({ items }: { items: { label: string; color: string; shape?: 'dot' | 'square' }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-2.5 w-2.5 ${it.shape === 'dot' ? 'rounded-full' : 'rounded-sm'}`} style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
