import list from './merchants.json'
import type { CategoryId } from './types'

export interface Merchant {
  id: string
  name: string
  category: CategoryId
  aliases: string[]
}

export const MERCHANTS = list as Merchant[]
export const MERCHANT_BY_ID = Object.fromEntries(MERCHANTS.map((m) => [m.id, m])) as Record<string, Merchant>

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9&]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Longest alias first, so "SWIGGY INSTAMART" beats "SWIGGY". */
const INDEX = MERCHANTS.flatMap((m) => m.aliases.map((a) => ({ alias: norm(a), merchant: m }))).sort(
  (a, b) => b.alias.length - a.alias.length,
)

/**
 * Find the merchant named in a narration. Aliases of five or more characters may start a
 * longer word ("SWIGGYUPI", "NETFLIXUPI"); shorter ones must be a whole word ("OLA", "JIO").
 */
export function matchMerchant(text: string): Merchant | undefined {
  const hay = ` ${norm(text)} `
  for (const { alias, merchant } of INDEX) {
    if (alias.length >= 5 ? hay.includes(` ${alias}`) : hay.includes(` ${alias} `)) return merchant
  }
  return undefined
}
