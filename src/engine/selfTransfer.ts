import { daysBetween, formatDay } from './dates'
import { formatINR } from './money'
import { BUSINESS_RE, TITLES } from './narration'
import type { SelfInfo, Statement, Txn, UserRules } from './types'

const TRANSFER_CHANNELS = new Set(['UPI', 'IMPS', 'NEFT', 'RTGS', 'OTHER'])
const SELF_WORDS_RE =
  /\bSELF\b|OWN A\/?C|OWN ACCOUNT|\bTO OWN\b|SELF TRANSFER|\bSWEEP\b|SWEEP (IN|OUT)|\bTO FD\b|FD BOOK|\bTRF TO FD\b|\bRD INST|RD INSTAL|TRANSFER TO RD/

function nameTokens(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t))
}

/**
 * Does a payee name refer to the account holder? Needs the first name AND surname, or an
 * initial + surname. A shared first name alone is not enough: "AKSHAY KUMAR" is not
 * "AKSHAY SINGH".
 */
export function matchesHolder(payee: string | undefined, holder: string | undefined): boolean {
  if (!payee || !holder) return false
  if (BUSINESS_RE.test(payee.toUpperCase())) return false
  const H = nameTokens(holder)
  const C = nameTokens(payee)
  if (H.length < 2 || !C.length) return false
  const first = H[0]
  const last = H[H.length - 1]
  if (C.length === 1 && (C[0] === first + last || C[0] === last + first)) return true
  if (C.includes(first) && C.includes(last)) return true
  if (C.includes(last) && C.some((t) => t.length === 1 && t === first[0])) return true
  return false
}

/**
 * Find transfers between the user's own accounts. Deliberately conservative: hiding a real
 * expense is worse than showing a transfer, and every match carries a reason the user can
 * undo from the Ignored list.
 */
export function detectSelfTransfers(
  txns: Txn[],
  statements: Statement[],
  rules: UserRules,
  payeeKeyOf: (t: Txn) => string,
): Map<string, SelfInfo> {
  const out = new Map<string, SelfInfo>()
  const notSelf = new Set(rules.notSelfPayees)
  const forcedSelf = new Set(rules.selfPayees)
  const holders = [...new Set(statements.map((s) => s.holderName).filter(Boolean) as string[])]
  const last4ByAccount = new Map(statements.map((s) => [s.accountKey, s.accountLast4]))
  const ownLast4 = new Set([
    ...(statements.map((s) => s.accountLast4).filter(Boolean) as string[]),
    ...rules.ownAccounts.filter((a) => /^\d{4}$/.test(a)),
  ])
  const ownVpas = new Set(rules.ownAccounts.filter((a) => a.includes('@')).map((a) => a.toLowerCase()))

  const eligible = (t: Txn) =>
    !notSelf.has(payeeKeyOf(t)) &&
    !t.mandate &&
    TRANSFER_CHANNELS.has(t.channel) &&
    t.counterparty.kind !== 'merchant'

  for (const t of txns) {
    const pk = payeeKeyOf(t)
    if (notSelf.has(pk)) continue
    if (forcedSelf.has(pk)) {
      out.set(t.id, { reason: 'You marked this payee as your own account.' })
      continue
    }
    if (!eligible(t)) continue
    const cp = t.counterparty
    const U = t.narration.toUpperCase()
    const thisLast4 = last4ByAccount.get(t.accountKey)
    if (cp.accountLast4 && cp.accountLast4 !== thisLast4 && ownLast4.has(cp.accountLast4)) {
      out.set(t.id, { reason: `Goes to/from your account ending ${cp.accountLast4}.` })
    } else if (cp.vpa && ownVpas.has(cp.vpa)) {
      out.set(t.id, { reason: `Goes to/from your UPI ID ${cp.vpa}.` })
    } else if (SELF_WORDS_RE.test(U)) {
      out.set(t.id, { reason: 'The bank marked it as a self / own-account / FD transfer.' })
    } else if (holders.some((h) => matchesHolder(cp.name, h))) {
      out.set(t.id, { reason: `Payee "${cp.name}" matches the account holder's name.` })
    }
  }

  // Pair a debit in one account with an equal credit in another within two days. A pair is
  // only trusted when one side is already known to be self, or neither side names some
  // other person (a friend paying you back the same ₹500 is not a self-transfer).
  const namesSomeoneElse = (t: Txn) =>
    t.counterparty.kind === 'person' && !!t.counterparty.name && !holders.some((h) => matchesHolder(t.counterparty.name, h))
  const accounts = new Set(txns.map((t) => t.accountKey))
  if (accounts.size > 1) {
    const credits = txns.filter((t) => t.credit > 0 && eligible(t))
    const used = new Set<string>()
    for (const d of txns) {
      if (d.debit <= 0 || !eligible(d)) continue
      let best: Txn | undefined
      let bestGap = Infinity
      for (const c of credits) {
        if (used.has(c.id) || c.accountKey === d.accountKey || c.credit !== d.debit) continue
        const trusted = out.has(d.id) || out.has(c.id) || (!namesSomeoneElse(d) && !namesSomeoneElse(c))
        if (!trusted) continue
        const gap = daysBetween(d.date, c.date)
        if (gap < -1 || gap > 2) continue
        if (Math.abs(gap) < bestGap) {
          best = c
          bestGap = Math.abs(gap)
        }
      }
      if (!best) continue
      used.add(best.id)
      const toLast4 = last4ByAccount.get(best.accountKey)
      const fromLast4 = last4ByAccount.get(d.accountKey)
      if (!out.has(d.id)) {
        out.set(d.id, {
          reason: `Matches a ${formatINR(best.credit)} credit in your account${toLast4 ? ` ending ${toLast4}` : ''} on ${formatDay(best.date)}.`,
        })
      }
      if (!out.has(best.id)) {
        out.set(best.id, {
          reason: `Matches a ${formatINR(d.debit)} debit from your account${fromLast4 ? ` ending ${fromLast4}` : ''} on ${formatDay(d.date)}.`,
        })
      }
    }
  }
  return out
}
