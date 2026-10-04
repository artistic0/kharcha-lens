import { ArrowLeftRight, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { formatDay } from '../engine/dates'
import { formatINR } from '../engine/money'
import { Button, Card, Empty } from '../components/ui'
import { useStore } from '../store'
import type { Derived } from '../useAnalysis'

export function Ignored({ d }: { d: Derived }) {
  const setSelf = useStore((s) => s.setSelf)
  const rules = useStore((s) => s.rules)
  const setOwnAccounts = useStore((s) => s.setOwnAccounts)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const self = d.txns.filter((t) => t.category === 'self')
  const moved = self.filter((t) => t.debit > 0).reduce((n, t) => n + t.debit, 0)
  const add = () => {
    const v = draft.trim().toLowerCase()
    if (!/^\d{4}$/.test(v) && !/^[\w.-]+@[\w]+$/.test(v)) {
      setError('Enter the last 4 digits of an account, or a UPI ID like name@okicici.')
      return
    }
    setError('')
    setOwnAccounts([...new Set([...rules.ownAccounts, v])])
    setDraft('')
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <p className="text-sm text-ink-2">
          Money moved between your own accounts isn’t spending or income, so it’s left out of every total{moved ? ` (${formatINR(moved)} moved here)` : ''}. The app is cautious: a payee who
          only shares your first name is never treated as you.
        </p>
        {!self.length ? (
          <Empty icon={<ArrowLeftRight size={22} />} title="No self-transfers found">
            Upload statements from all your accounts, or add your other accounts on the right.
          </Empty>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {self.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted" aria-hidden>
                  <ArrowLeftRight size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-ink">{t.payeeName}</span>
                    <span className="tabular text-sm font-semibold text-ink">{t.debit ? `−${formatINR(t.debit, true)}` : `+${formatINR(t.credit, true)}`}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {formatDay(t.date)} · {d.accounts.find((a) => a.key === t.accountKey)?.label}
                  </p>
                  <p className="mt-1 text-sm text-ink-2">{t.self?.reason ?? t.categoryWhy}</p>
                </div>
                <Button size="sm" onClick={() => setSelf(t.payeeKey, false)}>
                  Not a self-transfer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card title="Your other accounts" subtitle="Transfers to these are left out too — handy for accounts you didn’t upload.">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Last 4 digits or UPI ID</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="4321 or name@okicici"
              aria-invalid={!!error}
              aria-describedby="own-acc-err"
              className="min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            />
          </label>
          <Button type="submit" aria-label="Add account">
            <Plus size={16} aria-hidden />
          </Button>
        </form>
        <p id="own-acc-err" role="alert" className="mt-1 text-xs text-neg">
          {error}
        </p>
        {rules.ownAccounts.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {rules.ownAccounts.map((a) => (
              <li key={a} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1.5 pl-3 text-sm">
                {/^\d{4}$/.test(a) ? `••${a}` : a}
                <button type="button" aria-label={`Remove ${a}`} className="rounded-full p-0.5 text-muted hover:bg-surface-3 hover:text-ink" onClick={() => setOwnAccounts(rules.ownAccounts.filter((x) => x !== a))}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
