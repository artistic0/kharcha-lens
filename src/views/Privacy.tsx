import { ArrowLeft, CloudOff, EyeOff, FileLock2, ServerOff, ShieldCheck, WifiOff } from 'lucide-react'
import { useRequestsSinceLoad } from '../networkWatch'
import { PAGE_CSP } from '../security'
import { Button, Card } from '../components/ui'
import { useStore } from '../store'

const POINTS = [
  { icon: ServerOff, title: 'No server', body: 'The app is a set of static files. Your browser does all the work — there is nowhere for your data to go.' },
  { icon: FileLock2, title: 'Read in this tab', body: 'Files are opened with your browser’s file reader. PDF passwords are used once and dropped.' },
  { icon: EyeOff, title: 'No tracking', body: 'No account, cookies, analytics, error reporting, third-party scripts or fonts.' },
  { icon: CloudOff, title: 'Gone when you close it', body: 'Transactions live in this tab’s memory. Close the tab or clear data and they’re gone.' },
]

export function Privacy() {
  const requests = useRequestsSinceLoad()
  const remember = useStore((s) => s.rememberRules)
  const setRemember = useStore((s) => s.setRemember)
  const hasData = useStore((s) => s.results.length > 0)
  const setView = useStore((s) => s.setView)
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {!hasData && (
        <Button variant="ghost" onClick={() => setView('overview')}>
          <ArrowLeft size={16} aria-hidden /> Back
        </Button>
      )}
      <section className="hero relative overflow-hidden p-6 sm:p-8" aria-label="Network proof">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-3xl bg-white/12 ring-1 ring-white/20">
            <span className="tabular text-4xl font-semibold" data-testid="request-count">
              {requests ?? '…'}
            </span>
            <span className="text-[11px] text-white/70">requests</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold tracking-tight">Your statement never leaves this device</h2>
            <p className="mt-1 text-sm text-white/80">
              That number counts every network request this page has made since it loaded. It stays at zero — and if any code tried, the browser would block it.
            </p>
          </div>
        </div>
      </section>

      <ul className="grid gap-4 sm:grid-cols-2">
        {POINTS.map((p) => (
          <li key={p.title} className="card flex gap-4 p-5">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-text" aria-hidden>
              <p.icon size={19} />
            </span>
            <div>
              <h3 className="font-semibold text-ink">{p.title}</h3>
              <p className="mt-0.5 text-sm text-muted">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <Card title="Don’t trust us — check">
        <ol className="space-y-3 text-sm text-ink-2">
          <li className="flex gap-3">
            <WifiOff size={18} aria-hidden className="mt-0.5 shrink-0 text-brand-text" />
            <span>Turn on airplane mode after the page loads. Everything keeps working, including adding statements.</span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-brand-text" />
            <span>
              Open developer tools → Network, then add a statement: no request appears. The site’s Content-Security-Policy forbids the page from contacting <em>any</em> server, even
              ours:
            </span>
          </li>
        </ol>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-surface-2 p-4 text-xs leading-relaxed whitespace-pre-wrap text-ink">{PAGE_CSP.split('; ').join(';\n')}</pre>
        <p className="mt-3 text-sm text-muted">
          <code className="text-ink">connect-src 'none'</code> blocks fetch, XHR, WebSockets and beacons; <code className="text-ink">form-action 'none'</code> blocks form posts. After the first
          visit the app is cached, so it opens with no connection at all.
        </p>
      </Card>

      <Card title="What can be saved on this device">
        <p className="text-sm text-ink-2">
          Only if you switch it on: your category choices for payees, your “self / not self” corrections and your other account numbers (last 4 digits). Never transactions, amounts or
          statements — and only in this browser.
        </p>
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-surface-2 p-4">
          <span className="text-sm font-medium text-ink">Remember my category rules on this device</span>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" />
        </label>
      </Card>

      <p className="px-1 text-xs text-muted">
        KharchaLens shows what’s in your statements. It doesn’t recommend investments or products, and it isn’t affiliated with any bank or with NPCI. Categories are best guesses — check the
        “why” on any transaction and fix it in one tap.
      </p>
    </div>
  )
}
