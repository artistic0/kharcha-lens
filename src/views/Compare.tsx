import { ArrowDownRight, ArrowRight, ArrowUpRight, GitCompareArrows } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable } from '../charts/common'
import { Dumbbell } from '../charts/Dumbbell'
import { Heatmap } from '../charts/Heatmap'
import { SpendBreakdown } from '../charts/SpendBreakdown'
import { applyFilter, categoryByMonth, compare, kpis, spendByCategory } from '../engine/aggregate'
import { categoryLabel } from '../engine/categories'
import { formatMonth } from '../engine/dates'
import { formatINR } from '../engine/money'
import { Card, Empty, PillSelect, Segmented } from '../components/ui'
import { useStore } from '../store'
import type { Derived } from '../useAnalysis'

type Mode = 'months' | 'grid' | 'accounts'

export function Compare({ d }: { d: Derived }) {
  const months = d.months
  const accountsFilter = useStore((s) => s.filter.accounts)
  const scoped = useMemo(() => applyFilter(d.txns, { accounts: accountsFilter }), [d.txns, accountsFilter])
  const modes: { value: Mode; label: string }[] = [
    ...(months.length > 1 ? [{ value: 'months' as Mode, label: 'Month vs month' }, { value: 'grid' as Mode, label: 'All months' }] : []),
    ...(d.accounts.length > 1 ? [{ value: 'accounts' as Mode, label: 'Accounts' }] : []),
  ]
  const [pickMode, setMode] = useState<Mode>('months')
  const mode = modes.some((m) => m.value === pickMode) ? pickMode : modes[0]?.value
  const [pickA, setA] = useState(months[months.length - 2] ?? months[0])
  const [pickB, setB] = useState(months[months.length - 1])
  const a = months.includes(pickA) ? pickA : (months[months.length - 2] ?? months[0])
  const b = months.includes(pickB) ? pickB : months[months.length - 1]

  const rows = useMemo(() => compare(scoped.filter((t) => t.date.startsWith(a)), scoped.filter((t) => t.date.startsWith(b))), [scoped, a, b])
  const heat = useMemo(() => categoryByMonth(scoped), [scoped])

  if (!mode) {
    return (
      <Empty icon={<GitCompareArrows size={22} />} title="Add another month or account to compare">
        Upload a statement for a different month, or a second bank account, and this page shows what changed.
      </Empty>
    )
  }

  const totalA = rows.reduce((n, r) => n + r.a, 0)
  const totalB = rows.reduce((n, r) => n + r.b, 0)
  const change = totalA > 0 ? (totalB - totalA) / totalA : null
  const movers = rows
    .filter((r) => r.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 3)

  return (
    <div className="space-y-5">
      {modes.length > 1 && <Segmented label="Compare by" value={mode} onChange={setMode} options={modes} />}

      {mode === 'months' && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <PillSelect label="From month" value={a} onChange={setA}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </PillSelect>
            <ArrowRight size={18} aria-hidden className="mb-2.5 text-muted" />
            <PillSelect label="To month" value={b} onChange={setB}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </PillSelect>
          </div>

          <section className="hero relative overflow-hidden p-6 sm:p-8" aria-label="Month comparison summary">
            <h2 className="text-sm font-medium text-white/75">
              {formatMonth(a)} vs {formatMonth(b)}
            </h2>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <div className="text-xs text-white/70">{formatMonth(a)}</div>
                <div className="tabular text-2xl font-semibold sm:text-3xl">{formatINR(totalA)}</div>
              </div>
              <ArrowRight size={22} aria-hidden className="mb-1.5 text-white/60" />
              <div>
                <div className="text-xs text-white/70">{formatMonth(b)}</div>
                <div className="tabular text-2xl font-semibold sm:text-3xl">{formatINR(totalB)}</div>
              </div>
              {change !== null && (
                <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
                  {change <= 0 ? <ArrowDownRight size={15} aria-hidden /> : <ArrowUpRight size={15} aria-hidden />}
                  {Math.abs(Math.round(change * 100))}% {change <= 0 ? 'less' : 'more'}
                </span>
              )}
            </div>
            {movers.length > 0 && (
              <p className="mt-4 text-sm text-white/80">
                Biggest changes:{' '}
                {movers.map((m, i) => (
                  <span key={m.category}>
                    {i > 0 && ', '}
                    {categoryLabel(m.category)} {m.delta > 0 ? '+' : '−'}
                    {formatINR(Math.abs(m.delta))}
                  </span>
                ))}
              </p>
            )}
          </section>

          <Card title="By category" subtitle="Each row shows both months; the gap is the change.">
            {a === b ? (
              <p className="text-sm text-muted">Pick two different months.</p>
            ) : (
              <Dumbbell aLabel={formatMonth(a)} bLabel={formatMonth(b)} colorOf={d.colorOf} rows={rows.map((r) => ({ key: r.category, label: categoryLabel(r.category), a: r.a, b: r.b }))} />
            )}
          </Card>
        </>
      )}

      {mode === 'grid' && (
        <Card title="Every category, every month" subtitle="Darker means more spent — spot the months that ran hot.">
          <Heatmap months={heat.months} rows={heat.rows.map((r) => ({ key: r.category, label: categoryLabel(r.category), values: r.values }))} />
        </Card>
      )}

      {mode === 'accounts' && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {d.accounts.map((acc) => {
              const txns = d.txns.filter((t) => t.accountKey === acc.key)
              const k = kpis(txns)
              const cats = spendByCategory(txns)
              return (
                <Card key={acc.key} title={acc.label} subtitle={`${formatINR(k.spend)} spent · ${formatINR(k.income)} in`}>
                  <SpendBreakdown rows={cats} listLimit={6} total={k.spend} colored={d.colored} colorOf={d.colorOf} />
                  {cats.length > 6 && <p className="mt-2 text-xs text-muted">+ {cats.length - 6} smaller categories</p>}
                </Card>
              )
            })}
          </div>
          <Card title="Side by side">
            <div className="overflow-x-auto">
              <DataTable
                head={['Category', ...d.accounts.map((x) => x.label)]}
                align={['l', ...d.accounts.map(() => 'r' as const)]}
                rows={spendByCategory(d.txns).map((r) => [
                  categoryLabel(r.category),
                  ...d.accounts.map((x) => formatINR(spendByCategory(d.txns.filter((t) => t.accountKey === x.key)).find((c) => c.category === r.category)?.amount ?? 0)),
                ])}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
