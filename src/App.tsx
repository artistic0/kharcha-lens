import {
  ArrowLeftRight,
  CalendarClock,
  Ellipsis,
  FileText,
  GitCompareArrows,
  LayoutDashboard,
  Monitor,
  Moon,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sun,
  Trash,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Dropzone } from './components/Dropzone'
import { Filters } from './components/Filters'
import { LogoMark } from './components/LogoMark'
import { Jobs } from './components/Jobs'
import { Button, Dialog, Sheet } from './components/ui'
import { useRequestsSinceLoad } from './networkWatch'
import { useStore, type View } from './store'
import { useAnalysis } from './useAnalysis'
import { Compare } from './views/Compare'
import { Files } from './views/Files'
import { Ignored } from './views/Ignored'
import { Landing } from './views/Landing'
import { Overview } from './views/Overview'
import { Privacy } from './views/Privacy'
import { Recurring } from './views/Recurring'
import { Transactions } from './views/Transactions'

interface NavItem {
  id: View
  label: string
  icon: LucideIcon
  count?: number
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={small ? 28 : 32} />
      <span className={`font-semibold tracking-tight text-ink ${small ? 'text-base' : 'text-lg'}`}>KharchaLens</span>
    </span>
  )
}

/** Live proof: requests made since the page loaded (should stay 0). */
function PrivacyBadge({ compact = false }: { compact?: boolean }) {
  const requests = useRequestsSinceLoad()
  const setView = useStore((s) => s.setView)
  const ok = requests === null || requests === 0
  return (
    <button
      type="button"
      onClick={() => setView('privacy')}
      aria-label={`${requests ?? 'Counting'} network requests since the page loaded. Open privacy details.`}
      className={`flex items-center gap-2 rounded-xl text-left transition hover:bg-surface-2 ${compact ? 'border border-line px-2.5 py-1.5' : 'w-full border border-line bg-surface-2/60 p-3'}`}
    >
      <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: ok ? 'var(--good-mark)' : 'var(--warning)' }} />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: ok ? 'var(--good-mark)' : 'var(--warning)' }} />
      </span>
      {compact ? (
        <span aria-hidden className="text-xs font-medium text-ink-2">
          {requests ?? '…'} sent
        </span>
      ) : (
        <span aria-hidden className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{requests ?? '…'} requests sent</span>
          <span className="block text-xs text-muted">Everything stays on this device</span>
        </span>
      )}
    </button>
  )
}

type Theme = 'system' | 'light' | 'dark'
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('system')
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  return [theme, setTheme]
}

function ThemeSwitch({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const opts: { v: Theme; icon: LucideIcon; label: string }[] = [
    { v: 'light', icon: Sun, label: 'Light' },
    { v: 'system', icon: Monitor, label: 'Auto' },
    { v: 'dark', icon: Moon, label: 'Dark' },
  ]
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex w-full rounded-xl bg-surface-2 p-1">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={theme === o.v}
          aria-label={`${o.label} theme`}
          onClick={() => setTheme(o.v)}
          className={`flex flex-1 items-center justify-center rounded-lg py-1.5 transition ${theme === o.v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          <o.icon size={15} />
        </button>
      ))}
    </div>
  )
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active ? 'bg-brand-soft text-brand-text' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <item.icon size={18} aria-hidden />
      <span className="flex-1 text-left">{item.label}</span>
      {item.count !== undefined && item.count > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-brand/15' : 'bg-surface-2 text-muted'}`}>{item.count}</span>
      )}
    </button>
  )
}

const TITLES: Record<View, string> = {
  overview: 'Overview',
  compare: 'Compare',
  transactions: 'Transactions',
  recurring: 'Recurring payments',
  ignored: 'Self-transfers',
  files: 'Statements',
  privacy: 'Privacy',
}

export default function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const wipe = useStore((s) => s.wipe)
  const addOpen = useStore((s) => s.addOpen)
  const setAddOpen = useStore((s) => s.setAddOpen)
  const hasData = useStore((s) => s.results.length > 0)
  const [theme, setTheme] = useTheme()
  const [clearOpen, setClearOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const d = useAnalysis()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view])

  const selfCount = d.txns.filter((t) => t.category === 'self').length
  const primary: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'compare', label: 'Compare', icon: GitCompareArrows },
    { id: 'transactions', label: 'Transactions', icon: ReceiptText },
    { id: 'recurring', label: 'Recurring', icon: CalendarClock, count: d.recurring.filter((r) => !r.stopped).length },
  ]
  const secondary: NavItem[] = [
    { id: 'files', label: 'Statements', icon: FileText, count: d.statements.length },
    { id: 'ignored', label: 'Self-transfers', icon: ArrowLeftRight, count: selfCount },
    { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  ]

  if (!hasData && view !== 'privacy') {
    return (
      <Frame>
        <Landing theme={<ThemeSwitch theme={theme} setTheme={setTheme} />} />
      </Frame>
    )
  }

  let body: ReactNode
  if (view === 'privacy') body = <Privacy />
  else if (view === 'compare') body = <Compare d={d} />
  else if (view === 'transactions') body = <Transactions d={d} />
  else if (view === 'recurring') body = <Recurring d={d} />
  else if (view === 'ignored') body = <Ignored d={d} />
  else if (view === 'files') body = <Files d={d} />
  else body = <Overview d={d} />

  const showFilters = hasData && (view === 'overview' || view === 'transactions')

  return (
    <Frame>
      <div className="lg:grid lg:grid-cols-[256px_1fr]">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-line bg-surface px-4 py-6 lg:flex">
          <button type="button" onClick={() => setView('overview')} className="px-2" aria-label="KharchaLens overview">
            <Logo />
          </button>
          <nav aria-label="Main" className="space-y-1">
            {hasData && primary.map((it) => <NavButton key={it.id} item={it} active={view === it.id} onClick={() => setView(it.id)} />)}
          </nav>
          <nav aria-label="Data" className="space-y-1">
            <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">Your data</p>
            {secondary.filter((it) => hasData || it.id === 'privacy').map((it) => <NavButton key={it.id} item={it} active={view === it.id} onClick={() => setView(it.id)} />)}
          </nav>
          <div className="mt-auto space-y-3">
            <PrivacyBadge />
            <ThemeSwitch theme={theme} setTheme={setTheme} />
            {hasData && (
              <Button variant="danger" className="w-full justify-start" onClick={() => setClearOpen(true)}>
                <Trash size={16} aria-hidden /> Clear all data
              </Button>
            )}
          </div>
        </aside>

        <div className="min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md lg:border-0 lg:bg-page/70">
            <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-3 lg:px-8 lg:pt-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="lg:hidden">
                  <Logo small />
                </span>
                <h1 className="hidden truncate text-2xl font-semibold tracking-tight text-ink lg:block">{TITLES[view]}</h1>
              </div>
              <div className="flex items-center gap-2">
                <span className="lg:hidden">
                  <PrivacyBadge compact />
                </span>
                {showFilters && (
                  <span className="hidden md:block">
                    <Filters d={d} />
                  </span>
                )}
                {hasData && (
                  <Button variant="primary" onClick={() => setAddOpen(true)} aria-label="Add statements">
                    <Plus size={16} aria-hidden />
                    <span className="hidden sm:inline">Add statements</span>
                  </Button>
                )}
              </div>
            </div>
            {showFilters && (
              <div className="px-4 pb-3 md:hidden">
                <Filters d={d} />
              </div>
            )}
          </header>

          <main className="mx-auto max-w-[1180px] px-4 pt-4 pb-28 lg:px-8 lg:pt-2 lg:pb-12">
            <h1 className="mb-4 text-xl font-semibold tracking-tight text-ink lg:hidden">{TITLES[view]}</h1>
            {body}
          </main>
        </div>
      </div>

      {/* Bottom tabs (phones) */}
      {hasData && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          <ul className="grid grid-cols-5">
            {[...primary, { id: 'more' as View, label: 'More', icon: Ellipsis }].map((it) => {
              const active = it.label === 'More' ? ['files', 'ignored', 'privacy'].includes(view) : view === it.id
              return (
                <li key={it.label}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => (it.label === 'More' ? setMoreOpen(true) : setView(it.id))}
                    className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? 'text-brand-text' : 'text-muted'}`}
                  >
                    <it.icon size={20} aria-hidden />
                    {it.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="space-y-1">
          {secondary.map((it) => (
            <NavButton
              key={it.id}
              item={it}
              active={view === it.id}
              onClick={() => {
                setView(it.id)
                setMoreOpen(false)
              }}
            />
          ))}
        </div>
        <div className="mt-5 space-y-3">
          <ThemeSwitch theme={theme} setTheme={setTheme} />
          <Button
            variant="danger"
            className="w-full justify-start"
            onClick={() => {
              setMoreOpen(false)
              setClearOpen(true)
            }}
          >
            <Trash size={16} aria-hidden /> Clear all data
          </Button>
        </div>
      </Sheet>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add statements"
        footer={
          <Button variant="primary" onClick={() => setAddOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <Dropzone size="md" />
          <Jobs showDone />
        </div>
      </Dialog>

      <Dialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear all data?"
        footer={
          <>
            <Button onClick={() => setClearOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                wipe()
                setClearOpen(false)
              }}
            >
              Clear everything
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          This removes every statement and rule from this tab (and any rules you chose to remember on this device). Nothing exists anywhere else, so this can’t be undone.
        </p>
      </Dialog>
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-page text-ink">{children}</div>
}
