import { categoryLabel, isSpend } from './categories'
import { monthKey } from './dates'
import {
  CARD_BILL_RE,
  DEBIT_KEYWORDS,
  INTEREST_RE,
  INVESTMENT_RE,
  LOAN_RE,
  REFUND_RE,
  SALARY_RE,
} from './keywords'
import { matchMerchant, type Merchant } from './merchants'
import { BUSINESS_RE } from './narration'
import { detectSelfTransfers } from './selfTransfer'
import type { CategoryId, CategorySource, EnrichedTxn, Statement, Txn, UserRules } from './types'

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const PERSON_CHANNELS = new Set(['UPI', 'IMPS', 'NEFT', 'RTGS', 'OTHER'])

/**
 * Rent is usually a large, same-every-month transfer to a person around the same date.
 * Returns the ids of debits that look like rent.
 */
function likelyRentIds(txns: Txn[], payeeKey: Map<string, string>, merchants: Map<string, Merchant | undefined>, self: Map<string, unknown>) {
  const groups = new Map<string, Txn[]>()
  for (const t of txns) {
    if (t.debit <= 0 || self.has(t.id) || merchants.get(t.id) || t.mandate) continue
    if (!PERSON_CHANNELS.has(t.channel) || t.counterparty.kind === 'merchant') continue
    const k = payeeKey.get(t.id)!
    let g = groups.get(k)
    if (!g) groups.set(k, (g = []))
    g.push(t)
  }
  const candidates: { med: number; ids: string[] }[] = []
  for (const g of groups.values()) {
    const med = median(g.map((t) => t.debit))
    if (med < 3_000_00) continue
    const near = g.filter((t) => Math.abs(t.debit - med) <= med * 0.1)
    const months = new Set(near.map((t) => monthKey(t.date)))
    if (months.size < 2) continue
    const days = near.map((t) => Number(t.date.slice(8, 10)))
    const md = median(days)
    if (days.some((d) => Math.abs(d - md) > 6)) continue
    candidates.push({ med, ids: near.map((t) => t.id) })
  }
  candidates.sort((a, b) => b.med - a.med)
  return new Set(candidates.slice(0, 3).flatMap((c) => c.ids))
}

/** Salary: keyword, or a company paying a similar large amount in two or more months. */
function likelySalaryKeys(txns: Txn[], payeeKey: Map<string, string>, self: Map<string, unknown>) {
  const groups = new Map<string, Txn[]>()
  for (const t of txns) {
    if (t.credit < 10_000_00 || self.has(t.id)) continue
    if (!['NEFT', 'RTGS', 'IMPS', 'OTHER'].includes(t.channel)) continue
    const name = t.counterparty.name ?? ''
    if (t.counterparty.kind !== 'merchant' && !BUSINESS_RE.test(name)) continue
    const k = payeeKey.get(t.id)!
    let g = groups.get(k)
    if (!g) groups.set(k, (g = []))
    g.push(t)
  }
  const keys = new Set<string>()
  for (const [k, g] of groups) {
    if (new Set(g.map((t) => monthKey(t.date))).size >= 2) keys.add(k)
  }
  return keys
}

/**
 * Assign every transaction a category (first matching rule wins) and remember why, so the
 * UI can answer "why is this here?". Pure function: re-run whenever the user edits a rule.
 */
export function enrich(txns: Txn[], statements: Statement[], rules: UserRules): EnrichedTxn[] {
  const merchants = new Map<string, Merchant | undefined>()
  const payeeKey = new Map<string, string>()
  for (const t of txns) {
    const m = matchMerchant(`${t.counterparty.name ?? ''} ${t.counterparty.vpa ?? ''} ${t.narration}`)
    merchants.set(t.id, m)
    payeeKey.set(t.id, m ? `m:${m.id}` : t.counterparty.key)
  }
  const pk = (t: Txn) => payeeKey.get(t.id)!
  const self = detectSelfTransfers(txns, statements, rules, pk)
  const rentIds = likelyRentIds(txns, payeeKey, merchants, self)
  const salaryKeys = likelySalaryKeys(txns, payeeKey, self)

  // Latest spend category per payee, used to net refunds against the right category.
  const lastDebitCategory = new Map<string, CategoryId>()

  const out: EnrichedTxn[] = []
  for (const t of txns) {
    const m = merchants.get(t.id)
    const key = pk(t)
    const U = t.narration.toUpperCase()
    const s = self.get(t.id)
    const payeeName = m?.name ?? t.counterparty.name ?? t.counterparty.vpa ?? t.narration.slice(0, 32)
    const userCat = rules.payeeCategory[key]

    let category = 'misc' as CategoryId
    let source = 'fallback' as CategorySource
    let why = 'No rule matched.'
    let netAgainst: CategoryId | undefined
    const set = (c: CategoryId, src: CategorySource, w: string) => {
      category = c
      source = src
      why = w
    }

    if (t.debit > 0) {
      if (userCat && isSpend(userCat)) set(userCat, 'user', 'You set a category for this payee.')
      else if (userCat === 'investments') set(userCat, 'user', 'You set a category for this payee.')
      else if (s) set('self', 'self', s.reason)
      else if (t.channel === 'ATM') set('cash', 'channel', 'ATM cash withdrawal.')
      else if (t.channel === 'CHARGE' && !m) set('fees', 'channel', 'Bank charge or fee.')
      else if (m?.category === 'investments' || INVESTMENT_RE.test(U)) set('investments', m ? 'merchant' : 'keyword', m ? `Paid to ${m.name}.` : 'Looks like an investment (SIP / mutual fund / NPS).')
      else if (CARD_BILL_RE.test(U) || m?.category === 'cardbill') set('cardbill', 'keyword', 'Credit card bill payment.')
      else if ((t.channel === 'NACH' || t.channel === 'ECS' || t.channel === 'SI') && LOAN_RE.test(U) && (!m || m.category === 'emi')) set('emi', 'channel', 'Auto-debit to a lender.')
      else if (m) set(m.category, 'merchant', `Paid to ${m.name}.`)
      else {
        const kw = DEBIT_KEYWORDS.find(([re]) => re.test(U))
        if (kw) set(kw[1], 'keyword', `Narration mentions "${U.match(kw[0])?.[0]?.trim()}".`)
        else if (rentIds.has(t.id)) set('rent', 'heuristic', 'Same large amount to the same person around the same date every month — looks like rent.')
        else if (t.counterparty.kind === 'person' && PERSON_CHANNELS.has(t.channel)) set('transfers', 'fallback', 'Payment to a person.')
      }
      if (isSpend(category)) lastDebitCategory.set(key, category)
    } else {
      if (userCat && !isSpend(userCat)) set(userCat, 'user', 'You set a category for this payee.')
      else if (s) set('self', 'self', s.reason)
      else if (REFUND_RE.test(U) || (userCat && isSpend(userCat)) || (m && lastDebitCategory.has(key))) {
        netAgainst = userCat && isSpend(userCat) ? userCat : (lastDebitCategory.get(key) ?? (m && isSpend(m.category) ? m.category : undefined))
        set('refunds', 'keyword', netAgainst ? `Refund, netted against ${categoryLabel(netAgainst)}.` : 'Refund or reversal.')
      } else if (t.channel === 'INTEREST' || INTEREST_RE.test(U)) set('interest', 'channel', 'Interest credited by the bank.')
      else if (SALARY_RE.test(U)) set('salary', 'keyword', 'Narration mentions salary.')
      else if (salaryKeys.has(key)) set('salary', 'heuristic', 'Large monthly credit from a company — looks like salary.')
      else set('income_other', 'fallback', 'Money received.')
    }

    // Friendlier names where the narration's "payee" is really a place or a code.
    let displayName = payeeName
    if (category === 'cash') displayName = 'ATM cash withdrawal'
    else if (category === 'cardbill' && !m) displayName = `Credit card bill${t.counterparty.accountLast4 ? ` ••${t.counterparty.accountLast4}` : ''}`
    else if (category === 'fees' && !m) displayName = 'Bank charges'
    else if (category === 'interest') displayName = 'Interest from bank'

    out.push({
      ...t,
      payeeKey: key,
      payeeName: displayName,
      merchantId: m?.id,
      self: s,
      category,
      categorySource: source,
      categoryWhy: why,
      netAgainst,
      likelyRent: category === 'rent' && source === 'heuristic' ? true : undefined,
    })
  }
  return out
}
