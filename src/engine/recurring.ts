import { addDays, daysBetween } from './dates'
import type { CategoryId, EnrichedTxn, Paise } from './types'

export type Cadence = 'weekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'once'

const BUCKETS: { cadence: Exclude<Cadence, 'once'>; min: number; max: number; days: number; slack: number }[] = [
  { cadence: 'weekly', min: 6, max: 8, days: 7, slack: 3 },
  { cadence: 'monthly', min: 26, max: 35, days: 30.44, slack: 7 },
  { cadence: 'bimonthly', min: 56, max: 65, days: 60.88, slack: 10 },
  { cadence: 'quarterly', min: 85, max: 97, days: 91.31, slack: 20 },
  { cadence: 'halfyearly', min: 175, max: 190, days: 182.62, slack: 25 },
  { cadence: 'yearly', min: 355, max: 375, days: 365.25, slack: 30 },
]

export interface RecurringItem {
  id: string
  payeeKey: string
  name: string
  category: CategoryId
  cadence: Cadence
  /** Current charge (the latest amount for fixed-price items, the median for bills). */
  typical: Paise
  monthlyCost: Paise
  yearlyCost: Paise
  count: number
  total: Paise
  first: string
  last: string
  nextExpected?: string
  confidence: 'high' | 'medium'
  mandate: boolean
  variableAmount: boolean
  priceChange?: { from: Paise; to: Paise; date: string }
  trialConverted?: { amount: Paise; date: string }
  stopped: boolean
  txnIds: string[]
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(b, a) * tol

/** One clean step change: [499, 499, 649, 649] -> 499 to 649 at index 2. */
function priceStep(amounts: number[]): { k: number; from: number; to: number } | null {
  for (let k = 1; k < amounts.length; k++) {
    const a = amounts.slice(0, k)
    const b = amounts.slice(k)
    if (a.every((x) => near(x, a[0], 0.02)) && b.every((x) => near(x, b[0], 0.02)) && !near(a[0], b[0], 0.02)) {
      return { k, from: a[a.length - 1], to: b[0] }
    }
  }
  return null
}

const SKIP: CategoryId[] = ['cash', 'self', 'refunds', 'salary', 'interest', 'income_other']
const VARIABLE_OK: CategoryId[] = ['bills', 'rent', 'emi', 'insurance', 'investments', 'subscriptions', 'education', 'fees', 'cardbill', 'health']
const last0 = <T,>(xs: T[]) => xs[xs.length - 1]

/**
 * Find charges that repeat on a schedule. dataEnd is the last date covered by each account's
 * statements, used to tell "due soon" from "stopped".
 */
export function detectRecurring(txns: EnrichedTxn[], dataEnd: Map<string, string>): { items: RecurringItem[]; byTxn: Map<string, string> } {
  const groups = new Map<string, EnrichedTxn[]>()
  for (const t of txns) {
    if (t.debit <= 0 || SKIP.includes(t.category)) continue
    let g = groups.get(t.payeeKey)
    if (!g) groups.set(t.payeeKey, (g = []))
    g.push(t)
  }

  const items: RecurringItem[] = []
  const byTxn = new Map<string, string>()
  for (const [payeeKey, all] of groups) {
    const g = all.slice().sort((a, b) => (a.date < b.date ? -1 : 1))
    const mandate = g.some((t) => t.mandate)
    let trial: EnrichedTxn | undefined
    let charges = g
    if (g.length >= 2 && g[0].debit <= 5_00 && g[1].debit > 5_00) {
      trial = g[0]
      charges = g.slice(1)
    }
    const amounts = charges.map((t) => t.debit)
    const intervals: number[] = []
    for (let i = 1; i < charges.length; i++) intervals.push(daysBetween(charges[i - 1].date, charges[i].date))

    const counts = BUCKETS.map((b) => intervals.filter((d) => d >= b.min && d <= b.max).length)
    const bestIdx = counts.indexOf(Math.max(...counts))
    const bucket = intervals.length && counts[bestIdx] > 0 ? BUCKETS[bestIdx] : undefined
    const regularity = bucket ? counts[bestIdx] / intervals.length : 0

    const med = median(amounts)
    const mad = median(amounts.map((a) => Math.abs(a - med)))
    const stable = mad <= med * 0.1
    const step = priceStep(amounts)

    // Too many charges per period means it's a habit (food orders), not a subscription.
    const span = charges.length > 1 ? daysBetween(charges[0].date, charges[charges.length - 1].date) : 0
    const perPeriod = bucket ? charges.length / (span / bucket.days + 1) : 1
    if (bucket && perPeriod > 1.3) continue

    const isPerson = g[0].counterparty.kind === 'person'
    let confidence: RecurringItem['confidence'] | null = null
    if (charges.length >= 3 && regularity >= 0.75 && (stable || step)) confidence = 'high'
    else if (mandate && charges.length >= 2 && regularity >= 0.5) confidence = 'high'
    else if (charges.length === 2 && bucket && (stable || step)) confidence = 'medium'
    // Bills that vary month to month (electricity, phone). Frequent food or cab orders also
    // repeat with varying amounts, so this needs a bill-like category and a monthly+ cadence.
    else if (charges.length >= 3 && regularity >= 0.75 && !isPerson && bucket?.cadence !== 'weekly' && VARIABLE_OK.includes(last0(charges).category)) confidence = 'medium'
    else if (mandate && charges.length === 1) confidence = 'medium'
    if (!confidence) continue

    const id = `r:${payeeKey}`
    const last = charges[charges.length - 1]
    const variableAmount = !step && Math.max(...amounts) - Math.min(...amounts) > med * 0.15
    const typical = step ? step.to : variableAmount ? Math.round(med) : last.debit
    let nextExpected: string | undefined
    let stopped = false
    let monthlyCost = 0
    if (bucket) {
      const inBucket = intervals.filter((d) => d >= bucket.min && d <= bucket.max)
      nextExpected = addDays(last.date, Math.round(median(inBucket)))
      const end = dataEnd.get(last.accountKey)
      stopped = !!end && daysBetween(nextExpected, end) > bucket.slack
      monthlyCost = Math.round((typical * 30.44) / bucket.days)
    }
    const item: RecurringItem = {
      id,
      payeeKey,
      name: last.payeeName,
      category: last.category,
      cadence: bucket?.cadence ?? 'once',
      typical,
      monthlyCost,
      yearlyCost: monthlyCost * 12,
      count: charges.length,
      total: charges.reduce((n, t) => n + t.debit, 0),
      first: charges[0].date,
      last: last.date,
      nextExpected,
      confidence,
      mandate,
      variableAmount,
      priceChange: step ? { from: step.from, to: step.to, date: charges[step.k].date } : undefined,
      trialConverted: trial ? { amount: trial.debit, date: trial.date } : undefined,
      stopped,
      txnIds: g.map((t) => t.id),
    }
    items.push(item)
    for (const t of g) byTxn.set(t.id, id)
  }
  items.sort((a, b) => Number(a.stopped) - Number(b.stopped) || b.monthlyCost - a.monthlyCost)
  return { items, byTxn }
}
