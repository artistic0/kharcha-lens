import type { CustomLayout, GridView } from './gridView'

/** Money is always integer paise so sums never pick up float error. */
export type Paise = number

export type Channel =
  | 'UPI'
  | 'NACH'
  | 'ECS'
  | 'SI'
  | 'NEFT'
  | 'IMPS'
  | 'RTGS'
  | 'CARD'
  | 'ATM'
  | 'CHQ'
  | 'CHARGE'
  | 'INTEREST'
  | 'OTHER'

export type CounterpartyKind = 'merchant' | 'person' | 'unknown'

export interface Counterparty {
  name?: string
  vpa?: string
  /** Last 4 digits of an account/card mentioned in the narration, if any. */
  accountLast4?: string
  kind: CounterpartyKind
  /** Stable grouping key: VPA, else normalized name, else narration stem. */
  key: string
}

export interface Txn {
  id: string
  statementId: string
  accountKey: string
  /** ISO yyyy-mm-dd */
  date: string
  narration: string
  ref?: string
  debit: Paise
  credit: Paise
  balance?: Paise
  channel: Channel
  counterparty: Counterparty
  /** A mandate / autopay / NACH / standing-instruction marker was found. */
  mandate: boolean
}

export interface Statement {
  id: string
  fileName: string
  bank: string
  bankName: string
  accountKey: string
  accountLast4?: string
  holderName?: string
  from?: string
  to?: string
  rowCount: number
  /** Share of checkable rows whose running balance reconciles; null when no balance column. */
  reconcileRate: number | null
  /** 1-based row numbers that failed the balance check. */
  failedRows: number[]
  /** Ids of the transactions on those rows (for the inspector). */
  failedTxnIds?: string[]
  warnings: string[]
}

export interface ParseResult {
  statement: Statement
  txns: Txn[]
  /** The file as a grid (memory only): powers the inspector and the column wizard. */
  view?: GridView
}

/** Positioned text from one PDF page, y measured from the top. */
export interface PdfTextItem {
  s: string
  x: number
  y: number
  w: number
  h: number
}

export interface PdfPageText {
  page: number
  width: number
  height: number
  items: PdfTextItem[]
}

export type CategoryId =
  | 'food'
  | 'groceries'
  | 'rent'
  | 'bills'
  | 'shopping'
  | 'travel'
  | 'subscriptions'
  | 'health'
  | 'education'
  | 'emi'
  | 'insurance'
  | 'cardbill'
  | 'cash'
  | 'transfers'
  | 'fees'
  | 'misc'
  | 'investments'
  | 'self'
  | 'salary'
  | 'refunds'
  | 'interest'
  | 'income_other'

export type CategorySource =
  | 'user'
  | 'self'
  | 'channel'
  | 'merchant'
  | 'keyword'
  | 'heuristic'
  | 'fallback'

export interface UserRules {
  /** payeeKey -> category */
  payeeCategory: Record<string, CategoryId>
  /** payeeKeys the user says are their own accounts */
  selfPayees: string[]
  /** payeeKeys the user says are NOT self, even if a rule matched */
  notSelfPayees: string[]
  /** Last-4 digits of the user's other accounts/cards, or own VPAs */
  ownAccounts: string[]
  /** Statement layouts the user taught the app with the column wizard (no data inside). */
  customLayouts: CustomLayout[]
}

export const emptyRules = (): UserRules => ({
  payeeCategory: {},
  selfPayees: [],
  notSelfPayees: [],
  ownAccounts: [],
  customLayouts: [],
})

export interface SelfInfo {
  reason: string
}

/** A transaction after self-transfer detection and categorization. */
export interface EnrichedTxn extends Txn {
  payeeKey: string
  payeeName: string
  merchantId?: string
  self?: SelfInfo
  category: CategoryId
  categorySource: CategorySource
  categoryWhy: string
  /** For refunds: the spend category this credit is netted against. */
  netAgainst?: CategoryId
  likelyRent?: boolean
  recurringId?: string
}
