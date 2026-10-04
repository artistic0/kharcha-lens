import { describe, expect, it } from 'vitest'
import { parseDate } from '../../src/engine/dates'
import { formatINRCompact, parseAmount } from '../../src/engine/money'
import { parseNarration } from '../../src/engine/narration'
import { matchMerchant } from '../../src/engine/merchants'
import { matchesHolder } from '../../src/engine/selfTransfer'
import { detectHeader, GENERIC_PROFILE, roleForHeader } from '../../src/engine/profiles'
import { reconcile } from '../../src/engine/parse'

describe('parseAmount', () => {
  it.each([
    ['1,23,456.78', 12345678, undefined],
    ['500.00 Cr', 50000, 'CR'],
    ['500.00Dr', 50000, 'DR'],
    ['(1,200.00)', -120000, undefined],
    ['-45.5', -4550, undefined],
    ['₹ 99', 9900, undefined],
    ['17.70', 1770, undefined],
    ['0.1', 10, undefined],
  ])('%s', (raw, paise, side) => {
    expect(parseAmount(raw)).toEqual({ paise, side })
  })
  it('never picks up float error', () => {
    expect(parseAmount('1234.56')?.paise).toBe(123456)
    expect(parseAmount('0.29')?.paise).toBe(29)
  })
  it.each(['', 'abc', '12/07/2026', '1.2.3', 'UPI-123'])('rejects %s', (raw) => {
    expect(parseAmount(raw)).toBeNull()
  })
})

describe('parseDate', () => {
  it.each([
    ['01/07/26', '2026-07-01'],
    ['1-7-2026', '2026-07-01'],
    ['01.07.2026', '2026-07-01'],
    ['01-Jul-2026', '2026-07-01'],
    ['1 Jul 2026', '2026-07-01'],
    ['01 SEPT 2026', '2026-09-01'],
    ['2026-07-01', '2026-07-01'],
    ['01/07/2026 10:22:11', '2026-07-01'],
    ['Jul 1, 2026', '2026-07-01'],
  ])('%s', (raw, iso) => expect(parseDate(raw)).toBe(iso))
  it.each(['31/02/2026', '13/13/2026', 'hello', '612345678901'])('rejects %s', (raw) => expect(parseDate(raw)).toBeNull())
})

describe('formatINRCompact', () => {
  it('uses Indian units', () => {
    expect(formatINRCompact(95000)).toBe('₹950')
    expect(formatINRCompact(1234500)).toBe('₹12.3K')
    expect(formatINRCompact(45000000)).toBe('₹4.5L')
  })
})

describe('headers', () => {
  it('maps bank header cells to roles', () => {
    expect(roleForHeader('Chq./Ref.No.', GENERIC_PROFILE)).toBe('ref')
    expect(roleForHeader('Value Dt', GENERIC_PROFILE)).toBe('valueDate')
    expect(roleForHeader('Withdrawal Amount (INR )', GENERIC_PROFILE)).toBe('debit')
    expect(roleForHeader('Balance (INR )', GENERIC_PROFILE)).toBe('balance')
    expect(roleForHeader('Dr / Cr', GENERIC_PROFILE)).toBe('drcr')
    expect(roleForHeader('Transaction Date', GENERIC_PROFILE)).toBe('date')
  })
  it('needs date + amount + narration/balance', () => {
    expect(detectHeader(['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'], GENERIC_PROFILE)).not.toBeNull()
    expect(detectHeader(['Date', 'Name', 'City'], GENERIC_PROFILE)).toBeNull()
  })
})

describe('reconcile', () => {
  it('settles debit/credit for single-amount rows from the balance', () => {
    const rows = [
      { debit: 0, credit: 0, balance: 100000 },
      { debit: 0, credit: 0, balance: 90000, unknownSide: 10000 },
      { debit: 0, credit: 0, balance: 95000, unknownSide: 5000 },
    ]
    const r = reconcile(rows)
    expect(r.rate).toBe(1)
    expect(rows[1].debit).toBe(10000)
    expect(rows[2].credit).toBe(5000)
  })
  it('reports rows that do not add up', () => {
    const r = reconcile([
      { debit: 0, credit: 0, balance: 1000 },
      { debit: 100, credit: 0, balance: 900 },
      { debit: 100, credit: 0, balance: 700 },
    ])
    expect(r.rate).toBe(0.5)
    expect(r.failed).toEqual([3])
  })
})

describe('parseNarration', () => {
  it('HDFC UPI', () => {
    const n = parseNarration('UPI-SWIGGY LIMITED-SWIGGYUPI@AXB-UTIB0000000-612345678901-PAYMENT FROM PHONE')
    expect(n.channel).toBe('UPI')
    expect(n.counterparty.name).toBe('SWIGGY LIMITED')
    expect(n.counterparty.vpa).toBe('swiggyupi@axb')
    expect(n.counterparty.kind).toBe('merchant')
  })
  it('SBI UPI to a person', () => {
    const n = parseNarration('TO TRANSFER-UPI/DR/612345678901/RAMESH K/YESB/ramesh@ybl/Payment--')
    expect(n.counterparty.name).toBe('RAMESH K')
    expect(n.counterparty.kind).toBe('person')
  })
  it('NACH mandate', () => {
    const n = parseNarration('ACH D- BAJAJ FINANCE LTD-P400P12345678')
    expect(n.channel).toBe('NACH')
    expect(n.mandate).toBe(true)
    expect(n.counterparty.name).toBe('BAJAJ FINANCE LTD')
  })
  it('POS strips the card number', () => {
    const n = parseNarration('POS 416021XXXXXX1234 HPCL SHREE BALAJI FUEL')
    expect(n.channel).toBe('CARD')
    expect(n.counterparty.name).toBe('HPCL SHREE BALAJI FUEL')
    expect(n.counterparty.accountLast4).toBe('1234')
  })
  it('IMPS with masked account', () => {
    const n = parseNarration('IMPS-620123456789-RAHUL MEHTA-ICIC-XXXXXXXX8765-MONTHLY')
    expect(n.channel).toBe('IMPS')
    expect(n.counterparty.name).toBe('RAHUL MEHTA')
    expect(n.counterparty.accountLast4).toBe('8765')
  })
  it('ATM and charges', () => {
    expect(parseNarration('NWD-416021XXXXXX1234-S1AW12345-BANGALORE').channel).toBe('ATM')
    expect(parseNarration('SMS CHARGES FOR JUL-SEP 2026 INCL GST').channel).toBe('CHARGE')
  })
})

describe('matchMerchant', () => {
  it('prefers the longest alias', () => {
    expect(matchMerchant('UPI-SWIGGY INSTAMART-SWIGGY@ICICI')?.id).toBe('swiggy-instamart')
    expect(matchMerchant('UPI-SWIGGY LIMITED-SWIGGYUPI@AXB')?.id).toBe('swiggy')
  })
  it('short aliases need a whole word', () => {
    expect(matchMerchant('UPI-OLA CABS-OLA@YBL')?.id).toBe('ola')
    expect(matchMerchant('UPI-MOTOROLA STORE-X@YBL')?.id).not.toBe('ola')
    expect(matchMerchant('CREDIT INTEREST')?.id).toBeUndefined()
  })
  it('long aliases only match at a word start', () => {
    expect(matchMerchant('UPI-ABC TRANSPORTER-X@YBL')?.id).not.toBe('porter')
  })
})

describe('matchesHolder', () => {
  it.each([
    ['RAHUL MEHTA', true],
    ['MEHTA RAHUL', true],
    ['R MEHTA', true],
    ['MR RAHUL K MEHTA', true],
    ['RAHULMEHTA', true],
    ['RAHUL KUMAR', false],
    ['RAHUL', false],
    ['MEHTA ENTERPRISES', false],
    ['RAHUL M', false],
  ])('%s -> %s', (payee, expected) => expect(matchesHolder(payee, 'RAHUL MEHTA')).toBe(expected))
  it('a single-word holder name never matches', () => {
    expect(matchesHolder('RAHUL', 'RAHUL')).toBe(false)
  })
})
