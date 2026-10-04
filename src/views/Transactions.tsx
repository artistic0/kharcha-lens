import { Download, Repeat, Search, SearchX, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CATEGORIES, categoryLabel } from '../engine/categories'
import { formatDay } from '../engine/dates'
import { formatINR } from '../engine/money'
import type { CategoryId, EnrichedTxn } from '../engine/types'
import { CATEGORY_ICON, CategoryIcon } from '../components/categoryVisuals'
import { Button, Empty, PillSelect, Sheet } from '../components/ui'
import { useStore } from '../store'
import type { Derived } from '../useAnalysis'

const PAGE = 120
const REVIEW = new Set<CategoryId>(['misc', 'transfers'])
const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function exportCsv(rows: EnrichedTxn[], accountLabel: (k: string) => string) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = [
    'Date,Account,Payee,Narration,Category,Debit,Credit,Why',
    ...rows.map((t) =>
      [t.date, q(accountLabel(t.accountKey)), q(t.payeeName), q(t.narration), q(categoryLabel(t.category)), (t.debit / 100).toFixed(2), (t.credit / 100).toFixed(2), q(t.categoryWhy)].join(','),
    ),
  ]
  // Built in memory and handed to the browser as a download: nothing leaves the device.
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'kharchalens-transactions.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Amount({ t, big = false }: { t: EnrichedTxn; big?: boolean }) {
  const cls = big ? 'text-3xl font-semibold tracking-tight' : 'text-sm font-semibold'
  return t.credit ? (
    <span className={`tabular text-pos ${cls}`}>+{formatINR(t.credit, true)}</span>
  ) : (
    <span className={`tabular text-ink ${cls} ${t.category === 'self' ? 'text-muted line-through decoration-1' : ''}`}>−{formatINR(t.debit, true)}</span>
  )
}

export function Transactions({ d }: { d: Derived }) {
  const focus = useStore((s) => s.categoryFocus)
  const focusCategory = useStore((s) => s.focusCategory)
  const setPayeeCategory = useStore((s) => s.setPayeeCategory)
  const setSelf = useStore((s) => s.setSelf)
  const [q, setQ] = useState('')
  const [review, setReview] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null)

  const accountLabel = (k: string) => d.accounts.find((a) => a.key === k)?.short ?? k
  const countByPayee = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of d.txns) m.set(t.payeeKey, (m.get(t.payeeKey) ?? 0) + 1)
    return m
  }, [d.txns])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = d.filtered
    if (focus) list = list.filter((t) => t.category === focus || (t.category === 'refunds' && t.netAgainst === focus))
    if (review) list = list.filter((t) => t.debit > 0 && (REVIEW.has(t.category) || t.categorySource === 'heuristic'))
    if (needle) list = list.filter((t) => `${t.payeeName} ${t.narration} ${categoryLabel(t.category)}`.toLowerCase().includes(needle))
    const sorted = list.slice()
    if (review) sorted.sort((x, y) => y.debit - x.debit)
    else sorted.reverse()
    return sorted
  }, [d.filtered, focus, review, q])

  const open = openId ? d.txns.find((t) => t.id === openId) : undefined
  const shown = rows.slice(0, limit)
  const groups: { day: string; items: EnrichedTxn[] }[] = []
  for (const t of shown) {
    const key = review ? 'review' : t.date
    const last = groups[groups.length - 1]
    if (last && last.day === key) last.items.push(t)
    else groups.push({ day: key, items: [t] })
  }
  const totalOut = rows.reduce((n, t) => n + (t.category === 'self' ? 0 : t.debit), 0)
  const totalIn = rows.reduce((n, t) => n + (t.category === 'self' ? 0 : t.credit), 0)

  const recategorize = (t: EnrichedTxn, next: CategoryId | null) => {
    const prev = useStore.getState().rules.payeeCategory[t.payeeKey] ?? null
    const n = countByPayee.get(t.payeeKey) ?? 1
    if (next === 'self') {
      setSelf(t.payeeKey, true)
      setToast({ text: `${n === 1 ? 'This payment is' : `All ${n} payments with ${t.payeeName} are`} now treated as self-transfers.`, undo: () => setSelf(t.payeeKey, null) })
      return
    }
    if (t.category === 'self') setSelf(t.payeeKey, false)
    setPayeeCategory(t.payeeKey, next)
    setToast({
      text: next ? `${n === 1 ? 'This payment' : `All ${n} payments`} to ${t.payeeName} → ${categoryLabel(next)}.` : `${t.payeeName} is back to automatic categories.`,
      undo: () => setPayeeCategory(t.payeeKey, prev),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            aria-label="Search"
            onChange={(e) => {
              setQ(e.target.value)
              setLimit(PAGE)
            }}
            placeholder="Search payee, narration or category"
            className="min-h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-sm text-ink shadow-sm"
          />
        </label>
        <PillSelect label="Category" hideLabel value={focus ?? ''} onChange={(v) => focusCategory((v || null) as CategoryId | null)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </PillSelect>
        <button
          type="button"
          aria-pressed={review}
          onClick={() => setReview(!review)}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium shadow-sm transition ${
            review ? 'border-brand bg-brand-soft text-brand-text' : 'border-line bg-surface text-ink hover:bg-surface-2'
          }`}
        >
          <Zap size={15} aria-hidden /> Needs review
        </button>
        <Button onClick={() => exportCsv(rows, accountLabel)} disabled={!rows.length} aria-label="Export CSV">
          <Download size={15} aria-hidden />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {rows.length} transaction{rows.length === 1 ? '' : 's'}
          {focus && (
            <>
              {' '}in <strong className="font-semibold text-ink">{categoryLabel(focus)}</strong>{' '}
              <button type="button" className="text-brand-text hover:underline" onClick={() => focusCategory(null)}>
                clear
              </button>
            </>
          )}
        </span>
        <span className="tabular">
          Out {formatINR(totalOut)} · In {formatINR(totalIn)}
        </span>
      </div>
      {review && (
        <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm text-ink-2">
          Payments the app wasn’t sure about, biggest first. Set a category once and every payment to that payee follows.
        </p>
      )}

      {toast && (
        <div role="status" className="rise flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ink px-4 py-3 text-sm text-page shadow-lg">
          <span>{toast.text}</span>
          <span className="flex gap-1">
            <button
              type="button"
              className="rounded-lg px-2.5 py-1 font-semibold hover:bg-white/10"
              onClick={() => {
                toast.undo()
                setToast(null)
              }}
            >
              Undo
            </button>
            <button type="button" className="rounded-lg px-2 py-1 hover:bg-white/10" onClick={() => setToast(null)} aria-label="Close message">
              ✕
            </button>
          </span>
        </div>
      )}

      {!rows.length ? (
        <Empty icon={<SearchX size={22} />} title="No transactions match" />
      ) : (
        <div className="card overflow-hidden">
          {groups.map((g) => (
            <section key={g.day} aria-label={review ? 'Needs review' : formatDay(g.day)}>
              {!review && (
                <h3 className="border-b border-line bg-surface-2 px-5 py-2 text-xs font-semibold text-muted">
                  {weekday.format(new Date(`${g.day}T00:00:00Z`))}
                </h3>
              )}
              <ul className="divide-y divide-line">
                {g.items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(t.id)}
                      aria-label={`${t.payeeName}, ${categoryLabel(t.category)}, ${t.credit ? 'received' : 'paid'} ${formatINR(t.credit || t.debit, true)} on ${formatDay(t.date)}`}
                      className="flex w-full scroll-mt-32 items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 sm:px-5"
                    >
                      <CategoryIcon id={t.category} color={t.credit && t.category !== 'self' ? 'var(--pos)' : d.colorOf(t.category)} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{t.payeeName}</span>
                        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                          <span>{categoryLabel(t.category)}</span>
                          <span aria-hidden>·</span>
                          <span>{accountLabel(t.accountKey)}</span>
                          {review && <span>· {formatDay(t.date)}</span>}
                          {t.recurringId && (
                            <span className="inline-flex items-center gap-0.5 text-brand-text">
                              · <Repeat size={11} aria-hidden /> recurring
                            </span>
                          )}
                          {t.categorySource === 'user' && <span>· your rule</span>}
                        </span>
                      </span>
                      <Amount t={t} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {rows.length > limit && (
            <div className="border-t border-line p-4 text-center">
              <Button onClick={() => setLimit(limit + PAGE)}>Show more ({rows.length - limit} left)</Button>
            </div>
          )}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.payeeName ?? 'Transaction'}>
        {open && (
          <div className="space-y-6">
            <div>
              <Amount t={open} big />
              <p className="mt-1 text-sm text-muted">
                {formatDay(open.date)} · {d.accounts.find((a) => a.key === open.accountKey)?.label} · {open.channel}
                {open.mandate ? ' · autopay' : ''}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Category</h3>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.filter((c) => (open.debit > 0 ? c.kind !== 'income' : c.kind === 'income' || c.id === 'self' || c.kind === 'spend')).map((c) => {
                  const Icon = CATEGORY_ICON[c.id]
                  const active = open.category === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => !active && recategorize(open, c.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                        active ? 'border-brand bg-brand-soft font-semibold text-brand-text' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink'
                      }`}
                    >
                      <Icon size={15} aria-hidden />
                      <span className="truncate">{c.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-muted">
                Applies to {countByPayee.get(open.payeeKey) === 1 ? 'this payment' : `all ${countByPayee.get(open.payeeKey)} payments with this payee`}.
                {open.categorySource === 'user' && (
                  <>
                    {' '}
                    <button type="button" className="font-medium text-brand-text hover:underline" onClick={() => recategorize(open, null)}>
                      Back to automatic
                    </button>
                  </>
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-surface-2 p-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Why {categoryLabel(open.category)}?</h3>
              <p className="mt-1 text-sm text-ink">{open.categoryWhy}</p>
            </div>

            <div>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Bank narration</h3>
              <p className="rounded-xl border border-line p-3 font-mono text-xs break-all text-ink-2">{open.narration}</p>
            </div>

            {open.category === 'self' ? (
              <Button className="w-full" onClick={() => setSelf(open.payeeKey, false)}>
                Not a self-transfer — count it
              </Button>
            ) : (
              <Button className="w-full" onClick={() => setSelf(open.payeeKey, true)}>
                This is my own account — leave it out
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
