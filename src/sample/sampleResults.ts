import { parseNarration } from '../engine/narration'
import type { ParseResult, Txn } from '../engine/types'
import { buildSample, type SynthAccount } from './synth'

function toResult(acct: SynthAccount, bank: string, bankName: string, fileName: string): ParseResult {
  const id = `sample-${acct.id}`
  const accountKey = `${bank}:${acct.last4}`
  const txns: Txn[] = acct.txns.map((t, i) => {
    const info = parseNarration(t.narration)
    return {
      id: `${id}:${i + 1}`,
      statementId: id,
      accountKey,
      date: t.date,
      narration: t.narration,
      ref: t.ref,
      debit: t.debit,
      credit: t.credit,
      balance: t.balance,
      channel: info.channel,
      counterparty: info.counterparty,
      mandate: info.mandate,
    }
  })
  return {
    statement: {
      id,
      fileName,
      bank,
      bankName,
      accountKey,
      accountLast4: acct.last4,
      holderName: acct.holder,
      from: txns[0].date,
      to: txns[txns.length - 1].date,
      rowCount: txns.length,
      reconcileRate: 1,
      failedRows: [],
      warnings: [],
    },
    txns,
  }
}

/** Two made-up accounts (Jul–Sep 2026) so people can try the app without a statement. */
export function sampleResults(): ParseResult[] {
  const { A, B } = buildSample()
  return [
    toResult(A, 'hdfc', 'Sample bank A', 'sample-salary-account.pdf'),
    toResult(B, 'icici', 'Sample bank B', 'sample-spending-account.xlsx'),
  ]
}
