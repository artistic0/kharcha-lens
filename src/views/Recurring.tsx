import { CalendarClock, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { categoryLabel } from '../engine/categories'
import { formatDay } from '../engine/dates'
import { formatINR } from '../engine/money'
import type { RecurringItem } from '../engine/recurring'
import type { CategoryId } from '../engine/types'
import { CategoryIcon } from '../components/categoryVisuals'
import { Card, Empty, StatusPill } from '../components/ui'
import type { Derived } from '../useAnalysis'

const CADENCE: Record<RecurringItem['cadence'], string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  bimonthly: 'Every 2 months',
  quarterly: 'Quarterly',
  halfyearly: 'Every 6 months',
  yearly: 'Yearly',
  once: 'Autopay seen once',
}

const GROUPS: { title: string; cats: CategoryId[] }[] = [
  { title: 'Subscriptions', cats: ['subscriptions', 'health', 'education'] },
  { title: 'Bills & utilities', cats: ['bills', 'fees', 'travel', 'groceries', 'food', 'shopping', 'misc', 'cash'] },
  { title: 'Rent & people', cats: ['rent', 'transfers'] },
  { title: 'Loans, cards & insurance', cats: ['emi', 'cardbill', 'insurance'] },
  { title: 'Investments', cats: ['investments'] },
]

function Flags({ r }: { r: RecurringItem }) {
  const up = r.priceChange && r.priceChange.to > r.priceChange.from
  return (
    <div className="flex flex-wrap gap-1.5">
      {r.stopped && <StatusPill tone="neutral">Looks stopped</StatusPill>}
      {r.priceChange && up && (
        <StatusPill tone="warning">
          Price up {formatINR(r.priceChange.from)} → {formatINR(r.priceChange.to)}
        </StatusPill>
      )}
      {r.priceChange && !up && (
        <StatusPill tone="good">
          Price down {formatINR(r.priceChange.from)} → {formatINR(r.priceChange.to)}
        </StatusPill>
      )}
      {r.trialConverted && <StatusPill tone="warning">Trial turned paid</StatusPill>}
      {r.mandate && <StatusPill tone="info">Autopay</StatusPill>}
      {r.variableAmount && <StatusPill tone="neutral">Amount varies</StatusPill>}
      {r.confidence === 'medium' && <StatusPill tone="neutral">Possible</StatusPill>}
    </div>
  )
}

function RecurringCard({ r, color }: { r: RecurringItem; color: string }) {
  return (
    <li className={`card flex flex-col gap-4 p-5 ${r.stopped ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <CategoryIcon id={r.category} color={color} size={42} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-ink">{r.name}</h3>
          <p className="truncate text-xs text-muted">{CADENCE[r.cadence]}</p>
          <p className="truncate text-xs text-muted">{categoryLabel(r.category)}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-lg font-semibold text-ink">
            {r.variableAmount ? '≈ ' : ''}
            {formatINR(r.typical)}
          </div>
          {r.yearlyCost > 0 && <div className="tabular text-xs text-muted">{formatINR(r.yearlyCost)}/yr</div>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">
        <span>Last {formatDay(r.last)}</span>
        <span className="font-medium text-ink">{r.stopped ? 'No charge since' : r.nextExpected ? `Next ≈ ${formatDay(r.nextExpected)}` : `${r.count} payment`}</span>
      </div>
      {r.trialConverted && (
        <p className="text-xs text-muted">
          Started with a {formatINR(r.trialConverted.amount)} check on {formatDay(r.trialConverted.date)}.
        </p>
      )}
      <Flags r={r} />
    </li>
  )
}

export function Recurring({ d }: { d: Derived }) {
  const [showStopped, setShowStopped] = useState(false)
  const active = d.recurring.filter((r) => !r.stopped)
  const stopped = d.recurring.filter((r) => r.stopped)
  const monthly = active.reduce((n, r) => n + r.monthlyCost, 0)
  const subs = active.filter((r) => r.category === 'subscriptions')
  const flagged = active.filter((r) => r.trialConverted || (r.priceChange && r.priceChange.to > r.priceChange.from))

  if (!d.recurring.length) {
    return (
      <Empty icon={<CalendarClock size={22} />} title="No repeating payments yet">
        Load two or more months of statements so patterns can show up.
      </Empty>
    )
  }

  return (
    <div className="space-y-6">
      <section className="hero relative overflow-hidden p-6 sm:p-8" aria-label="Recurring summary">
        <div className="pointer-events-none absolute -top-20 -right-10 h-60 w-60 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <p className="text-sm font-medium text-white/75">On autopilot every month</p>
        <p className="tabular mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{formatINR(monthly)}</p>
        <p className="mt-1 text-sm text-white/80">{formatINR(monthly * 12)} a year across {active.length} repeating payments</p>
        <dl className="mt-6 grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <dt className="text-xs text-white/70">Subscriptions</dt>
            <dd className="tabular text-lg font-semibold">{formatINR(subs.reduce((n, r) => n + r.monthlyCost, 0))}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <dt className="text-xs text-white/70">Autopays</dt>
            <dd className="tabular text-lg font-semibold">{active.filter((r) => r.mandate).length}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <dt className="text-xs text-white/70">Worth a look</dt>
            <dd className="tabular text-lg font-semibold">{flagged.length}</dd>
          </div>
        </dl>
      </section>

      {GROUPS.map((g) => {
        const items = active.filter((r) => g.cats.includes(r.category))
        if (!items.length) return null
        return (
          <section key={g.title} aria-label={g.title}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-ink">{g.title}</h2>
              <span className="tabular text-sm text-muted">{formatINR(items.reduce((n, r) => n + r.monthlyCost, 0))}/mo</span>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((r) => (
                <RecurringCard key={r.id} r={r} color={d.colorOf(r.category)} />
              ))}
            </ul>
          </section>
        )
      })}

      {stopped.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowStopped(!showStopped)} aria-expanded={showStopped} className="flex items-center gap-1.5 text-sm font-medium text-brand-text">
            <ChevronDown size={16} className={showStopped ? 'rotate-180' : ''} aria-hidden />
            {showStopped ? 'Hide' : 'Show'} {stopped.length} that look stopped
          </button>
          {showStopped && (
            <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stopped.map((r) => (
                <RecurringCard key={r.id} r={r} color={d.colorOf(r.category)} />
              ))}
            </ul>
          )}
        </section>
      )}

      <Card title="Want to cancel one?">
        <ul className="grid gap-4 text-sm text-ink-2 sm:grid-cols-3">
          <li>
            <strong className="block text-ink">UPI AutoPay</strong>
            Open any UPI app → <em>AutoPay / Mandates</em>. Since 31 Dec 2025 every UPI app can show and cancel mandates made in other apps.
          </li>
          <li>
            <strong className="block text-ink">NACH / ECS</strong>
            EMIs, insurance and SIPs: ask the company to stop the mandate, or use “manage mandates” in your net banking.
          </li>
          <li>
            <strong className="block text-ink">Card autopay</strong>
            Manage it in your card app under standing instructions / e-mandates.
          </li>
        </ul>
      </Card>
    </div>
  )
}
