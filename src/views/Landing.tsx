import { ArrowRight, CloudOff, FileSpreadsheet, KeyRound, Lock, ServerOff, ShieldCheck, Sparkles, UserX } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { kpis, spendByCategory } from '../engine/aggregate'
import { analyze } from '../engine/analyze'
import { categoryLabel } from '../engine/categories'
import { mergeResults } from '../engine/merge'
import { formatINR } from '../engine/money'
import { emptyRules } from '../engine/types'
import { CategoryIcon, SLOTS } from '../components/categoryVisuals'
import { Dropzone } from '../components/Dropzone'
import { LogoMark } from '../components/LogoMark'
import { Jobs } from '../components/Jobs'
import { Button } from '../components/ui'
import { sampleResults } from '../sample/sampleResults'
import { useStore } from '../store'

const TRUST = [
  { icon: ServerOff, label: 'Nothing uploaded' },
  { icon: CloudOff, label: 'Works offline' },
  { icon: UserX, label: 'No sign-up' },
  { icon: KeyRound, label: 'Locked PDFs OK' },
]

const STEPS = [
  { icon: FileSpreadsheet, title: 'Add statements', body: 'PDF, CSV or Excel from net banking. Add several months and accounts at once.' },
  { icon: Sparkles, title: 'See the picture', body: 'Every payment sorted — food, rent, bills, subscriptions, EMIs — with the reason for each guess.' },
  { icon: ShieldCheck, title: 'Stay private', body: 'Processing happens in your browser. The page is blocked from contacting any server, even ours.' },
]

/** A small, real preview rendered from the built-in sample data. */
function Preview() {
  const data = useMemo(() => {
    const merged = mergeResults(sampleResults())
    const a = analyze(merged.txns, merged.statements, emptyRules())
    const sep = a.txns.filter((t) => t.date.startsWith('2026-09'))
    const aug = kpis(a.txns.filter((t) => t.date.startsWith('2026-08')))
    const cats = spendByCategory(sep)
    const k = kpis(sep)
    return { k, cats: cats.slice(0, 5), all: cats, drop: Math.round((1 - k.spend / aug.spend) * 100) }
  }, [])
  const color = (i: number) => `var(${SLOTS[i]})`
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-[var(--brand)]/25 via-transparent to-[var(--series-3)]/20 blur-2xl" />
      <div className="relative space-y-3 rounded-[28px] border border-line bg-surface p-4 shadow-2xl">
        <div className="hero p-5">
          <p className="text-xs text-white/70">Spent · Sept 2026</p>
          <p className="tabular text-3xl font-semibold tracking-tight">{formatINR(data.k.spend)}</p>
          <p className="mt-1 text-xs text-white/75">{data.drop}% less than Aug · {data.k.selfTransfers} self-transfers left out</p>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
            {data.all.map((c, i) => (
              <span key={c.category} style={{ flexGrow: c.amount, flexBasis: 0, background: i < SLOTS.length ? color(i) : 'var(--series-other)' }} />
            ))}
          </div>
          <ul className="mt-3 space-y-2.5">
            {data.cats.map((c, i) => (
              <li key={c.category} className="flex items-center gap-3">
                <CategoryIcon id={c.category} color={color(i)} size={30} />
                <span className="flex-1 text-sm font-medium text-ink">{categoryLabel(c.category)}</span>
                <span className="tabular text-sm font-semibold text-ink">{formatINR(c.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-[var(--ink)]" style={{ background: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}>
            !
          </span>
          <span className="text-sm text-ink">
            <strong className="font-semibold">Netflix costs more now</strong>
            <span className="block text-xs text-muted">₹499 → ₹649 — ₹1,800 more a year</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export function Landing({ theme }: { theme: ReactNode }) {
  const loadSample = useStore((s) => s.loadSample)
  const setView = useStore((s) => s.setView)
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--brand-soft),transparent)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-lg font-semibold tracking-tight">KharchaLens</span>
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setView('privacy')}>
            <Lock size={15} aria-hidden /> <span className="hidden sm:inline">How it’s private</span>
          </Button>
          <div className="w-32">{theme}</div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <section className="grid items-center gap-12 py-8 lg:grid-cols-[1.05fr_1fr] lg:py-14">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 shadow-sm">
              <ShieldCheck size={13} aria-hidden className="text-pos" /> 100% on your device · no sign-up
            </span>
            <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-6xl">
              Where did my
              <br />
              <span className="bg-gradient-to-r from-[var(--brand)] to-[var(--series-3)] bg-clip-text text-transparent">money go?</span>
            </h1>
            <p className="mt-4 max-w-lg text-lg text-ink-2">
              Drop in your bank statements and get a clear, private breakdown — categories, trends, autopays — in seconds. Your statement never leaves this device.
            </p>
            <div className="mt-7 max-w-lg space-y-3">
              <Dropzone />
              <Jobs />
              <button type="button" onClick={loadSample} className="group inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-brand-text">
                Try sample data
                <ArrowRight size={15} aria-hidden className="transition group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
          <Preview />
        </section>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRUST.map((t) => (
            <li key={t.label} className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink shadow-sm">
              <t.icon size={17} aria-hidden className="text-brand-text" />
              {t.label}
            </li>
          ))}
        </ul>

        <section className="mt-16" aria-labelledby="how">
          <h2 id="how" className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-soft text-brand-text" aria-hidden>
                    <s.icon size={19} />
                  </span>
                  <span className="text-xs font-semibold text-muted">STEP {i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-12 text-center text-xs text-muted">
          Tuned for HDFC, SBI and ICICI layouts; other banks usually work through the generic reader. Not financial advice · not affiliated with any bank or NPCI.
        </p>
      </main>
    </div>
  )
}
