/**
 * Synthetic statements with known answers. Used by the tests (rendered to PDF/XLSX/CSV and
 * parsed back) and by the app's "Try sample data" button. Every person and account here is
 * made up.
 */
import type { CategoryId, Paise } from '../engine/types'

export interface SynthTxn {
  date: string
  narration: string
  ref: string
  debit: Paise
  credit: Paise
  balance: Paise
  expect: CategoryId
  /** Short label for test failure messages. */
  tag: string
}

export interface SynthAccount {
  id: 'A' | 'B'
  holder: string
  holderTitle: string
  accountNumber: string
  last4: string
  opening: Paise
  txns: SynthTxn[]
}

/** Small deterministic PRNG so the sample is identical on every run. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MONTHS = ['2026-07', '2026-08', '2026-09']
const rs = (rupees: number) => Math.round(rupees * 100)
const d = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`

type Draft = Omit<SynthTxn, 'balance'>

function finish(drafts: Draft[], opening: Paise): SynthTxn[] {
  const sorted = drafts
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.i - b.i))
    .map((x) => x.t)
  let bal = opening
  return sorted.map((t) => {
    bal = bal - t.debit + t.credit
    return { ...t, balance: bal }
  })
}

export function buildSample(): { A: SynthAccount; B: SynthAccount } {
  const r = rng(20261002)
  let ref = 612340000001
  const nextRef = () => String(ref++)
  const pick = (min: number, max: number) => Math.round(min + r() * (max - min))

  // ---------- Account A: salary account, HDFC-style narrations ----------
  const a: Draft[] = []
  const debitA = (date: string, narration: string, amount: Paise, expect: CategoryId, tag: string) =>
    a.push({ date, narration, ref: nextRef(), debit: amount, credit: 0, expect, tag })
  const creditA = (date: string, narration: string, amount: Paise, expect: CategoryId, tag: string) =>
    a.push({ date, narration, ref: nextRef(), debit: 0, credit: amount, expect, tag })

  MONTHS.forEach((m, mi) => {
    creditA(d(m, 1), `NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-RAHUL MEHTA-CITIN2607${mi}00123`, rs(120000), 'salary', 'salary')
    debitA(d(m, [3, 4, 3][mi]), `UPI-RAJESH GUPTA-RAJESH.GUPTA@OKAXIS-UTIB0001234-${nextRef()}-PAYMENT FROM PHONE`, rs(18000), 'rent', 'rent')
    debitA(d(m, 5), `ACH D- BAJAJ FINANCE LTD-P400P1234567${mi}`, rs(3450), 'emi', 'emi')
    debitA(d(m, 7), `ACH D- INDIAN CLEARING CORP-ICCLSIP2607${mi}`, rs(5000), 'investments', 'sip')
    debitA(d(m, 10), `UPI-NETFLIX COM-NETFLIXUPI.PAYU@HDFCBANK-HDFC0MERUPI-${nextRef()}-UPI MANDATE`, rs([499, 499, 649][mi]), 'subscriptions', 'netflix')
    debitA(d(m, 12), `UPI-SPOTIFY INDIA-SPOTIFY.RZP@AXISBANK-UTIB0000100-${nextRef()}-UPI MANDATE`, rs([1, 119, 119][mi]), 'subscriptions', 'spotify')
    debitA(d(m, 15), `UPI-BHARTI AIRTEL LTD-AIRTEL.PAYU@HDFCBANK-HDFC0MERUPI-${nextRef()}-AIRTEL POSTPAID`, rs(599), 'bills', 'airtel')
    debitA(d(m, 18), `UPI-BESCOM-BESCOM.BILLDESK@HDFCBANK-HDFC0000001-${nextRef()}-ELECTRICITY BILL`, rs([1240, 1480, 1310][mi]), 'bills', 'bescom')
    debitA(d(m, 22), 'POS 416021XXXXXX1234 HPCL SHREE BALAJI FUEL', rs(2000), 'travel', 'fuel')
    const swiggyDays = [2, 8, 13, 19, 26]
    swiggyDays.forEach((day) =>
      debitA(d(m, day), `UPI-SWIGGY LIMITED-SWIGGYUPI@AXB-UTIB0000000-${nextRef()}-PAYMENT FROM PHONE`, rs(pick(180, 650)), 'food', 'swiggy'),
    )
    ;[9, 24].forEach((day) =>
      debitA(d(m, day), `UPI-ZOMATO LTD-ZOMATO.ORDER@PTYBL-YESB0PTMUPI-${nextRef()}-PAYMENT`, rs(pick(220, 540)), 'food', 'zomato'),
    )
    ;[6, 16, 27].forEach((day) =>
      debitA(d(m, day), `UPI-BLINKIT-BLINKIT.PAYU@HDFCBANK-HDFC0MERUPI-${nextRef()}-PAYMENT FROM PHONE`, rs(pick(300, 1200)), 'groceries', 'blinkit'),
    )
    ;[11, 23].forEach((day) =>
      debitA(d(m, day), `UPI-SHARMA GENERAL STORE-PAYTMQR2810050501011ABC@PAYTM-PYTM0123456-${nextRef()}-PAYMENT`, rs(pick(150, 800)), 'groceries', 'kirana'),
    )
    ;[4, 14, 21].forEach((day) =>
      debitA(d(m, day), `UPI-UBER INDIA SYSTEMS PVT LTD-UBER.RIDES@ICICI-ICIC0DC0099-${nextRef()}-PAYMENT`, rs(pick(150, 450)), 'travel', 'uber'),
    )
  })
  debitA('2026-07-09', `UPI-AMAZON PAY INDIA PVT LTD-AMAZON@APL-UTIB0000553-${nextRef()}-ORDER`, rs(2499), 'shopping', 'amazon')
  creditA('2026-08-02', `UPI-AMAZON PAY INDIA PVT LTD-AMAZON@APL-UTIB0000553-${nextRef()}-REFUND`, rs(2499), 'refunds', 'amazon refund')
  debitA('2026-09-14', `UPI-MYNTRA DESIGNS PVT LTD-MYNTRA.PAYU@HDFCBANK-HDFC0MERUPI-${nextRef()}-PAYMENT`, rs(1799), 'shopping', 'myntra')
  debitA('2026-08-21', `UPI-APOLLO PHARMACY-APOLLOPHARMACY@ICICI-ICIC0DC0099-${nextRef()}-PAYMENT`, rs(640), 'health', 'apollo')
  debitA('2026-07-25', 'NWD-416021XXXXXX1234-S1AW12345-BANGALORE', rs(3000), 'cash', 'atm')
  debitA('2026-09-25', 'NWD-416021XXXXXX1234-S1AW12399-BANGALORE', rs(3000), 'cash', 'atm')
  // Same first name as the holder: must NOT be treated as a self-transfer.
  debitA('2026-08-17', `UPI-RAHUL KUMAR-RAHULK92@OKSBI-SBIN0001234-${nextRef()}-DINNER SPLIT`, rs(1500), 'transfers', 'friend rahul kumar')
  // Same amount as a credit in B a day later, but both sides name other people: not self.
  debitA('2026-07-27', `UPI-PRIYA NAIR-PRIYANAIR@OKAXIS-UTIB0000123-${nextRef()}-GIFT`, rs(800), 'transfers', 'gift priya')
  // Self-transfers to account B (…8765).
  debitA('2026-07-20', 'IMPS-620123456789-RAHUL MEHTA-ICIC-XXXXXXXX8765-MONTHLY', rs(20000), 'self', 'self imps')
  debitA('2026-09-20', `UPI-R MEHTA-RAHULMEHTA@OKICICI-ICIC0001234-${nextRef()}-PAYMENT`, rs(10000), 'self', 'self upi')
  debitA('2026-08-15', 'CC 000416021XXXXXX9876 AUTOPAY SI-TAD', rs(12340), 'cardbill', 'card bill')
  debitA('2026-09-30', 'SMS CHARGES FOR JUL-SEP 2026 INCL GST', rs(17.7), 'fees', 'sms charges')

  // ---------- Account B: spending account, ICICI-style narrations ----------
  const b: Draft[] = []
  const debitB = (date: string, narration: string, amount: Paise, expect: CategoryId, tag: string) =>
    b.push({ date, narration, ref: nextRef(), debit: amount, credit: 0, expect, tag })
  const creditB = (date: string, narration: string, amount: Paise, expect: CategoryId, tag: string) =>
    b.push({ date, narration, ref: nextRef(), debit: 0, credit: amount, expect, tag })

  creditB('2026-07-20', 'IMPS/P2A/620123456789/RAHUL MEHTA/HDFC BANK/XXXXXX4321', rs(20000), 'self', 'self imps in')
  creditB('2026-09-21', 'UPI/RAHUL MEHTA/rahulmehta@okicici/PAYMENT/HDFC BANK/612345678901', rs(10000), 'self', 'self upi in')
  creditB('2026-07-28', 'UPI/ROHIT VERMA/rohitv@okhdfcbank/Payment/HDFC BANK/612399990001', rs(800), 'income_other', 'friend pays back')
  MONTHS.forEach((m, mi) => {
    debitB(d(m, 2), `UPI/CULTFIT/cultfit.rzp@icici/UPI Mandate/ICICI Bank/${nextRef()}`, rs(1299), 'health', 'cultfit')
    debitB(d(m, 8), `UPI/APPLE MEDIA SERVICES/appleservices.bdsi@hdfcbank/UPI Mandate/HDFC BANK/${nextRef()}`, rs(179), 'subscriptions', 'apple')
    ;[5, 19].forEach((day) =>
      debitB(d(m, day), `UPI/ZOMATO/zomato.order@ptybl/Payment/YES BANK/${nextRef()}`, rs(pick(250, 700)), 'food', 'zomato B'),
    )
    debitB(d(m, [11, 27, 9][mi]), `UPI/BIGBASKET/bigbasket.payu@hdfcbank/Payment/HDFC BANK/${nextRef()}`, rs(pick(1800, 2600)), 'groceries', 'bigbasket')
  })
  debitB('2026-08-06', 'ACH/HDFC LIFE INSURANCE/POLICY 12345678', rs(2500), 'insurance', 'insurance')
  debitB('2026-07-12', 'NEFT/SBIN0004321/ST JOSEPHS SCHOOL/FEES JUL', rs(15000), 'education', 'school')
  debitB('2026-08-23', 'POS/BARBEQUE NATION/BANGALORE', rs(2340), 'food', 'barbeque nation')
  creditB('2026-09-30', 'INT.PD:01-07-2026 TO 30-09-2026', rs(312), 'interest', 'interest')

  return {
    A: {
      id: 'A',
      holder: 'RAHUL MEHTA',
      holderTitle: 'MR',
      accountNumber: '50100123454321',
      last4: '4321',
      opening: rs(85000),
      txns: finish(a, rs(85000)),
    },
    B: {
      id: 'B',
      holder: 'RAHUL MEHTA',
      holderTitle: 'Mr.',
      accountNumber: '00000031234568765',
      last4: '8765',
      opening: rs(40000),
      txns: finish(b, rs(40000)),
    },
  }
}
