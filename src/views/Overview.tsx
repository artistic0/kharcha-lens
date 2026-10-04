import { ArrowDownRight, ArrowUpRight, ChevronRight, Info, Sparkles, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { SpendBreakdown } from '../charts/SpendBreakdown'
import { applyFilter, kpis, monthlySeries, spendByCategory, topPayees, type MonthPoint } from '../engine/aggregate'
import { categoryLabel } from '../engine/categories'
import { formatDay, formatMonth, formatMonthShort } from '../engine/dates'
import { buildInsights, type Insight } from '../engine/insights'
import { formatINR, formatINRCompact } from '../engine/money'
import { CategoryIcon, Initials } from '../components/categoryVisuals'
import { periodLabel } from '../components/Filters'
import { Card, Empty } from '../components/ui'
import { useStore } from '../store'
import type { Derived } from '../useAnalysis'

const pct = (x: number) => `${Math.round(x * 100)}%`

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/10 px-3 py-3 sm:px-4">
      <dt className="text-xs text-white/70">{label}</dt>
      <dd className="tabular mt-0.5 text-[15px] font-semibold sm:text-xl">{value}</dd>
      {sub && <dd className="text-xs text-white/70">{sub}</dd>}
    </div>
  )
}

/**
 * Money out per month inside the hero. Emphasis form: the focused month (or the latest) is
 * solid white, the rest translucent. Every bar carries its value as a direct label, so the
 * numbers never depend on reading bar heights.
 */
function HeroMonths({ series, selected, onSelect }: { series: MonthPoint[]; selected: string | null; onSelect: (m: string) => void }) {
  const max = Math.max(1, ...series.map((s) => s.spend))
  const focus = selected ?? series[series.length - 1].month
  return (
    <div className="mt-auto pt-7">
      <p className="mb-2 text-xs font-medium text-white/70">Money out by month · tap to focus</p>
      <div className="flex items-end gap-2 sm:gap-3" role="group" aria-label="Money out by month">
        {series.slice(-12).map((s) => {
          const on = s.month === focus
          return (
            <button
              key={s.month}
              type="button"
              onClick={() => onSelect(s.month)}
              aria-pressed={s.month === selected}
              aria-label={`${formatMonth(s.month)}: ${formatINR(s.spend)} out`}
              className="group flex min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              <span className={`tabular text-[11px] font-medium ${on ? 'text-white' : 'text-white/60'}`}>{formatINRCompact(s.spend)}</span>
              <span className="flex h-24 w-full max-w-[40px] items-end">
                <span
                  className={`w-full rounded-t-lg rounded-b-sm transition ${on ? 'bg-white' : 'bg-white/25 group-hover:bg-white/40'}`}
                  style={{ height: `${Math.max(4, (s.spend / max) * 100)}%` }}
                />
              </span>
              <span className={`text-[11px] ${on ? 'font-semibold text-white' : 'text-white/60'}`}>{formatMonthShort(s.month)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  const setView = useStore((s) => s.setView)
  const focusCategory = useStore((s) => s.focusCategory)
  const Icon = insight.tone === 'warning' ? TriangleAlert : insight.tone === 'good' ? Sparkles : Info
  const color = insight.tone === 'warning' ? 'var(--warning)' : insight.tone === 'good' ? 'var(--good-mark)' : 'var(--brand)'
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (!insight.link) return
          if (insight.link.category) focusCategory(insight.link.category)
          setView(insight.link.view)
        }}
        className="group flex w-full items-start gap-3 rounded-2xl p-3 text-left transition hover:bg-surface-2"
      >
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color: `color-mix(in srgb, ${color} 75%, var(--ink))` }}
        >
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{insight.title}</span>
          <span className="mt-0.5 block text-sm text-muted">{insight.body}</span>
        </span>
        <ChevronRight size={16} aria-hidden className="mt-2 text-muted opacity-0 transition group-hover:opacity-100" />
      </button>
    </li>
  )
}

export function Overview({ d }: { d: Derived }) {
  const filter = useStore((s) => s.filter)
  const setFilter = useStore((s) => s.setFilter)
  const setView = useStore((s) => s.setView)
  const focusCategory = useStore((s) => s.focusCategory)
  const [showAll, setShowAll] = useState(false)

  const k = useMemo(() => kpis(d.filtered), [d.filtered])
  const cats = useMemo(() => spendByCategory(d.filtered), [d.filtered])
  const payees = useMemo(() => topPayees(d.filtered, 5), [d.filtered])
  const accountScoped = useMemo(() => applyFilter(d.txns, { accounts: filter.accounts }), [d.txns, filter.accounts])
  const series = useMemo(() => monthlySeries(accountScoped), [accountScoped])
  const insights = useMemo(() => buildInsights(accountScoped, d.recurring).slice(0, 4), [accountScoped, d.recurring])
  const selectedMonth = filter.from && filter.from === filter.to ? filter.from : null

  // Month-on-month change for the hero, when one month is selected.
  const prevIdx = selectedMonth ? series.findIndex((s) => s.month === selectedMonth) - 1 : -1
  const prev = prevIdx >= 0 ? series[prevIdx] : null
  const change = prev && prev.spend > 0 ? (k.spend - prev.spend) / prev.spend : null

  const upcoming = d.recurring
    .filter((r) => !r.stopped && r.nextExpected)
    .sort((a, b) => (a.nextExpected! < b.nextExpected! ? -1 : 1))
    .slice(0, 4)

  if (!d.filtered.length) return <Empty title="No transactions match these filters." />

  const openCategory = (c: (typeof cats)[number]['category']) => {
    focusCategory(c)
    setView('transactions')
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="hero relative flex flex-col overflow-hidden p-6 sm:p-8 lg:col-span-7" aria-label="Summary">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <p className="text-sm font-medium text-white/75">Spent · {periodLabel(d, filter)}</p>
          <p className="tabular mt-1 text-4xl font-semibold tracking-tight sm:text-5xl" data-testid="hero-spent">
            {formatINR(k.spend)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
            {change !== null && prev && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 font-medium text-white">
                {change <= 0 ? <ArrowDownRight size={14} aria-hidden /> : <ArrowUpRight size={14} aria-hidden />}
                {pct(Math.abs(change))} {change <= 0 ? 'less' : 'more'} than {formatMonth(prev.month)}
              </span>
            )}
            {k.refunds > 0 && <span>after {formatINR(k.refunds)} of refunds</span>}
            {k.selfTransfers > 0 && <span>· {k.selfTransfers} self-transfers left out</span>}
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            <HeroStat label="Money in" value={formatINR(k.income)} />
            <HeroStat label="Invested" value={formatINR(k.invested)} />
            <HeroStat label="Saved" value={formatINR(k.net)} sub={k.savingsRate === null ? undefined : `${pct(k.savingsRate)} of income`} />
          </dl>
          {series.length > 1 && (
            <HeroMonths
              series={series}
              selected={selectedMonth}
              onSelect={(m) => setFilter(m === selectedMonth ? { from: undefined, to: undefined } : { from: m, to: m })}
            />
          )}
        </section>

        <Card title="Worth knowing" className="lg:col-span-5" pad={false}>
          {insights.length ? (
            <ul className="px-2 pb-3 sm:px-3">{insights.map((i) => <InsightRow key={i.id} insight={i} />)}</ul>
          ) : (
            <p className="px-6 pb-6 text-sm text-muted">Add another month to see trends.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card
          title="Where it went"
          subtitle={`${formatINR(k.spend)} across ${cats.length} categories`}
          className="lg:col-span-7"
        >
          <SpendBreakdown rows={cats} total={k.spend} colored={d.colored} colorOf={d.colorOf} onSelect={openCategory} listLimit={showAll ? undefined : 8} />
          {cats.length > 8 && (
            <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="mt-2 w-full rounded-xl py-2 text-sm font-medium text-brand-text hover:bg-surface-2">
              {showAll ? 'Show fewer' : `Show all ${cats.length} categories`}
            </button>
          )}
        </Card>

        <div className="space-y-5 lg:col-span-5">
          {upcoming.length > 0 && (
            <Card
              title="Coming up"
              subtitle="Expected recurring charges"
              action={
                <button type="button" onClick={() => setView('recurring')} className="text-sm font-medium text-brand-text hover:underline">
                  See all
                </button>
              }
            >
              <ul className="space-y-3">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <CategoryIcon id={r.category} color={d.colorOf(r.category)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                      <span className="block text-xs text-muted">≈ {formatDay(r.nextExpected!)}</span>
                    </span>
                    <span className="tabular text-sm font-semibold text-ink">
                      {r.variableAmount ? '≈ ' : ''}
                      {formatINR(r.typical)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Top payees">
            <ul className="space-y-3">
              {payees.map((p) => (
                <li key={p.payeeKey} className="flex items-center gap-3">
                  <Initials name={p.name} color={d.colorOf(p.category)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink" title={p.name}>
                      {p.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {categoryLabel(p.category)} · {p.count} payment{p.count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="tabular text-sm font-semibold text-ink">{formatINR(p.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
