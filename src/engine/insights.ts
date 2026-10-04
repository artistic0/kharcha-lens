import { kpis, monthlySeries, spendByCategory } from './aggregate'
import { categoryLabel } from './categories'
import { formatDay, formatMonth } from './dates'
import { formatINR } from './money'
import type { RecurringItem } from './recurring'
import type { CategoryId, EnrichedTxn } from './types'

export interface Insight {
  id: string
  tone: 'warning' | 'good' | 'info'
  title: string
  body: string
  /** Where tapping the insight should take the user. */
  link?: { view: 'recurring' | 'compare' | 'transactions' | 'ignored'; category?: CategoryId }
}

/** A handful of plain-language observations, most actionable first. */
export function buildInsights(txns: EnrichedTxn[], recurring: RecurringItem[]): Insight[] {
  const out: Insight[] = []

  for (const r of recurring) {
    if (r.stopped) continue
    if (r.priceChange && r.priceChange.to > r.priceChange.from) {
      const extra = (r.priceChange.to - r.priceChange.from) * (r.cadence === 'monthly' ? 12 : r.cadence === 'weekly' ? 52 : 1)
      out.push({
        id: `price-${r.id}`,
        tone: 'warning',
        title: `${r.name} costs more now`,
        body: `${formatINR(r.priceChange.from)} → ${formatINR(r.priceChange.to)} since ${formatDay(r.priceChange.date)}${r.cadence === 'monthly' ? ` — ${formatINR(extra)} more a year` : ''}.`,
        link: { view: 'recurring' },
      })
    }
    if (r.trialConverted) {
      out.push({
        id: `trial-${r.id}`,
        tone: 'warning',
        title: `${r.name} trial turned paid`,
        body: `A ${formatINR(r.trialConverted.amount)} check on ${formatDay(r.trialConverted.date)}, now ${formatINR(r.typical)} ${r.cadence === 'monthly' ? 'a month' : 'each time'}.`,
        link: { view: 'recurring' },
      })
    }
  }

  const months = monthlySeries(txns)
  if (months.length >= 2) {
    const [prev, last] = months.slice(-2)
    if (prev.spend > 0) {
      const pct = Math.round(((last.spend - prev.spend) / prev.spend) * 100)
      if (pct !== 0) {
        out.push({
          id: 'mom',
          tone: pct < 0 ? 'good' : pct > 10 ? 'warning' : 'info',
          title: `${Math.abs(pct)}% ${pct < 0 ? 'less' : 'more'} spent in ${formatMonth(last.month)}`,
          body: `${formatINR(last.spend)} vs ${formatINR(prev.spend)} in ${formatMonth(prev.month)}.`,
          link: { view: 'compare' },
        })
      }
    }
  }

  const k = kpis(txns)
  const cats = spendByCategory(txns)
  if (cats.length && k.spend > 0) {
    const top = cats[0]
    out.push({
      id: 'top-cat',
      tone: 'info',
      title: `${categoryLabel(top.category)} is ${Math.round((top.amount / k.spend) * 100)}% of your spending`,
      body: `${formatINR(top.amount)} across ${top.count} payment${top.count === 1 ? '' : 's'}.`,
      link: { view: 'transactions', category: top.category },
    })
  }

  if (k.selfTransfers > 0) {
    out.push({
      id: 'self',
      tone: 'info',
      title: `${k.selfTransfers} self-transfer${k.selfTransfers === 1 ? '' : 's'} left out`,
      body: 'Money moved between your own accounts isn’t counted as spending or income.',
      link: { view: 'ignored' },
    })
  }
  return out
}
