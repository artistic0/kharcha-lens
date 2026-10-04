import type { Channel, Counterparty, CounterpartyKind } from './types'

export interface NarrationInfo {
  channel: Channel
  counterparty: Counterparty
  mandate: boolean
}

const MANDATE_RE =
  /MANDATE|AUTOPAY|AUTO[ -]PAY|\bNACH\b|\bACH\b|\bECS\b|E-?MANDATE|STANDING INSTRUCTION|\bSI[- ]|RECURRING/

const CHANNEL_RULES: [Channel, RegExp][] = [
  ['NACH', /\bNACH\b|\bACH\b/],
  ['ECS', /\bECS\b/],
  ['UPI', /\bUPI\b/],
  ['IMPS', /\bIMPS\b|\bMMT\b/],
  ['NEFT', /\bNEFT\b/],
  ['RTGS', /\bRTGS\b/],
  ['ATM', /\bATM\b|^NWD\b|^ATW\b|^EAW\b|CASH WDL|CASH WITHDRAWAL|\bATM WDL\b/],
  ['CARD', /\bPOS\b|DEBIT CARD|\bVPS\b|\bIPS\b|\bECOM\b|\bME DC\b/],
  ['SI', /STANDING INSTRUCTION|\bSI[- ]/],
  ['INTEREST', /INT\.?\s?PD|\bINTEREST\b|INT\.\s?CREDIT|\bSB INT\b|\bINT CR\b|CREDIT INTEREST/],
  ['CHARGE', /CHARGES?\b|\bCHGS?\b|\bFEE\b|\bGST\b|SMS ALERT|\bAMC\b|MIN BAL|NON MAINT|CONSOLIDATED CHARGES/],
  ['CHQ', /\bCHQ\b|CHEQUE|\bCLG\b|CLEARING|\bINW\b/],
]

/** Words that are never a payee name on their own. */
const STOP = new Set(
  [
    'UPI', 'DR', 'CR', 'P2M', 'P2A', 'PAY', 'PAID', 'PAYMENT', 'PAYMENT FROM PH', 'PAYMENT FROM PHONE',
    'PAYMENT FROM', 'SENT', 'SENT USING PAYTM', 'RECEIVED', 'TRANSFER', 'TO TRANSFER', 'BY TRANSFER',
    'NEFT', 'NEFT DR', 'NEFT CR', 'IMPS', 'RTGS', 'RTGS DR', 'RTGS CR', 'NACH', 'NACH DR', 'ACH', 'ACH D',
    'ACH DR', 'ECS', 'POS', 'ATM', 'NWD', 'ATW', 'EAW', 'MANDATE', 'UPI MANDATE', 'AUTOPAY', 'COLLECT',
    'REQUEST', 'NA', 'NULL', 'INB', 'MB', 'MOB', 'IB', 'BIL', 'BILLPAY', 'ONL', 'OK', 'NO REMARKS',
    'UPI INTENT', 'UPIINTENT', 'PAY TO', 'REF', 'MMT', 'IMPS P2A', 'SI', 'TPT', 'ECOM', 'VPS', 'IPS',
    'HDFC BANK', 'HDFC BANK LTD', 'ICICI BANK', 'ICICI BANK LTD', 'STATE BANK OF INDIA', 'SBI', 'AXIS BANK',
    'YES BANK', 'YES BANK LTD', 'KOTAK MAHINDRA BANK', 'KOTAK BANK', 'PAYTM PAYMENTS BANK', 'PAYTM',
    'AIRTEL PAYMENTS BANK', 'IDFC FIRST BANK', 'INDUSIND BANK', 'BANK OF BARODA', 'PUNJAB NATIONAL BANK',
    'CANARA BANK', 'UNION BANK OF INDIA', 'FEDERAL BANK', 'FINO PAYMENTS BANK', 'JIO PAYMENTS BANK',
    'SBIN', 'HDFC', 'ICIC', 'UTIB', 'KKBK', 'YESB', 'PYTM', 'IDIB', 'BARB', 'PUNB', 'CNRB', 'UBIN', 'FDRL',
    'IDFB', 'INDB', 'AIRP', 'BKID', 'MAHB', 'CBIN', 'IOBA', 'UCBA', 'NETBANK', 'MUM', 'NETBANKING',
  ].map((s) => s.toUpperCase()),
)

export const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'M/S', 'MS.', 'SHRI', 'SMT', 'DR', 'KUMARI', 'SRI', 'SHRIMATI'])

export const BUSINESS_RE =
  /\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CORP|CORPORATION|COMPANY|ENTERPRISES?|STORES?|MART|TRADERS?|TRADING|SERVICES?|SOLUTIONS|TECHNOLOGIES|TECHNOLOGY|TECH|FOODS?|PHARMA|PHARMACY|MEDICALS?|MEDICOS|HOSPITALS?|CLINIC|HOTELS?|RESTAURANT|CAFE|BAKERY|BAKERS|SWEETS|AGENCY|AGENCIES|CENTRE|CENTER|INDUSTRIES|SCHOOL|COLLEGE|UNIVERSITY|ACADEMY|INSURANCE|FINANCE|FINSERV|CAPITAL|BANK|FUELS?|PETROLEUM|PETROL|FILLING|MOTORS|AUTOMOBILES|ELECTRONICS|GENERAL|KIRANA|PROVISIONS?|SUPERMARKET|BAZAAR|COLLECTIONS|FASHIONS?|TEXTILES|JEWELLERS|ELECTRICITY|POWER|TELECOM|COMMUNICATIONS|BROADBAND|NETWORKS?|MEDIA|ENTERTAINMENT|SYSTEMS|LABS?|DIAGNOSTICS?|HEALTHCARE|FITNESS|GYM|SALON|INFOCOMM|RETAIL|DIGITAL|ONLINE|PAYMENTS?|TRAVELS?|TOURS|LOGISTICS|SOCIETY|ASSOCIATION|TRUST|FOUNDATION|CLEARING|EXCHANGE|SECURITIES|BROKING|MUTUAL|FUND|AMC)\b/

const MERCHANT_VPA_RE =
  /paytmqr|bharatpe|\.rzp|razorpay|payu|cashfree|^cf\.|\bpos\b|mswipe|pinelabs|billdesk|\.bdsi|ezetap|instamojo|yespay|merchant|^mab\.|^q\d{6,}|gpay-\d+|\.ipay|ccavenue|juspay|phonepe\.|^paytm-|zomato|swiggy|amazon|flipkart/

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Strip transport words from the front of a token: "POS HPCL FUEL" -> "HPCL FUEL". */
function stripPrefix(t: string): string {
  return t
    .replace(/^(POS|ECOM|VPS|IPS|NEFT ?(DR|CR)?|IMPS ?(P2A)?|RTGS ?(DR|CR)?|UPI|ACH ?DR?|NACH ?DR|BIL|BILLPAY ?DR?|TO TRANSFER|BY TRANSFER|INB|MB|NWD|ATW|EAW|ME DC SI)\b[\s:]*/i, '')
    .trim()
}

function candidateName(t: string): string | null {
  const s = clean(stripPrefix(t.replace(/\b\d*X{2,}\d+\b|\b\d{5,}\b/g, ' ')))
  if (s.length < 3) return null
  if (!/^[A-Z][A-Z .&']*[A-Z.]$/.test(s)) return null
  if (STOP.has(s)) return null
  if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(s)) return null // IFSC
  if (/^(PAYMENT|PAY|SENT|RECEIVED)\b/.test(s)) return null
  return s
}

export function normalizeName(name: string): string {
  return clean(
    name
      .toUpperCase()
      .replace(/[^A-Z0-9 &]/g, ' ')
      .split(' ')
      .filter((w) => w && !TITLES.has(w) && !['PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'THE', 'INDIA', 'IN'].includes(w))
      .join(' '),
  )
}

function kindOf(channel: Channel, name: string | undefined, vpa: string | undefined): CounterpartyKind {
  if (channel === 'NACH' || channel === 'ECS' || channel === 'SI' || channel === 'CARD') return 'merchant'
  if (vpa && MERCHANT_VPA_RE.test(vpa)) return 'merchant'
  if (name && BUSINESS_RE.test(name)) return 'merchant'
  if (name && ['UPI', 'IMPS', 'NEFT', 'RTGS', 'OTHER'].includes(channel)) {
    const words = name.split(' ').filter((w) => !TITLES.has(w))
    if (words.length >= 1 && words.length <= 4 && words.every((w) => /^[A-Z.']+$/.test(w))) return 'person'
  }
  return 'unknown'
}

/** Work out channel, payee and mandate markers from a bank narration. */
export function parseNarration(narration: string): NarrationInfo {
  const U = clean(narration.toUpperCase())
  const mandate = MANDATE_RE.test(U)
  const channel = CHANNEL_RULES.find(([, re]) => re.test(U))?.[0] ?? 'OTHER'

  // HDFC-style narrations use "-" between fields, so a VPA there can't contain one.
  const dashFields = (U.match(/-/g)?.length ?? 0) >= 3 && !U.includes('/')
  const vpaMatch = dashFields
    ? U.match(/([A-Z0-9][A-Z0-9._]{1,})@([A-Z][A-Z0-9]{1,})/)
    : U.match(/([A-Z0-9][A-Z0-9._-]{1,})@([A-Z][A-Z0-9]{1,})/)
  const vpa = vpaMatch ? `${vpaMatch[1]}@${vpaMatch[2]}`.toLowerCase() : undefined
  const acctMatch = U.match(/(?:X{2,}|\*{2,})(\d{4})\b/)
  const accountLast4 = acctMatch?.[1]

  let name: string | undefined
  const tokens = U.split(/[-/*:|]+|\s{2,}/).map(clean).filter(Boolean)
  for (const t of tokens) {
    if (t.includes('@')) continue
    const c = candidateName(t)
    if (c) {
      name = c
      break
    }
  }
  if (!name && vpa) {
    const local = vpa.split('@')[0].replace(/[\d._-]+/g, ' ').trim().toUpperCase()
    if (local.length >= 3) name = local
  }

  const kind = kindOf(channel, name, vpa)
  let key: string
  if (vpa) key = `v:${vpa}`
  else if (name) key = `n:${normalizeName(name)}`
  else key = `s:${U.replace(/[^A-Z ]/g, ' ').split(' ').filter((w) => w.length > 2).slice(0, 3).join(' ') || U.slice(0, 20)}`

  return { channel, mandate, counterparty: { name, vpa, accountLast4, kind, key } }
}
