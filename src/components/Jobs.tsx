import { Check, FileText, KeyRound, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useStore, type Job } from '../store'
import { Button } from './ui'

function PasswordForm({ job }: { job: Job }) {
  const submit = useStore((s) => s.submitPassword)
  const [pw, setPw] = useState('')
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (pw) void submit(job.id, pw)
        setPw('')
      }}
    >
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">PDF password</span>
          <input
            type="password"
            autoComplete="off"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Statement password"
            aria-label="PDF password"
            className="min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            aria-describedby={`pw-hint-${job.id}`}
          />
        </label>
        <Button type="submit" variant="primary">
          Open
        </Button>
      </div>
      <p id={`pw-hint-${job.id}`} className="text-xs text-muted">
        Usually built from your name, date of birth or customer ID — check the email it came with. Used once to open the file, never stored.
      </p>
    </form>
  )
}

function Layout({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <details className="mt-3 rounded-xl bg-surface-2 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-ink-2">Help us support this bank (anonymized layout)</summary>
      <p className="mt-2 text-muted">Every letter becomes “A/a” and every digit “9”, so no names, amounts or account numbers remain. Check before sharing.</p>
      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface p-2 text-[11px] text-ink">{text}</pre>
      <Button size="sm" className="mt-2" onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}>
        {copied ? 'Copied' : 'Copy anonymized layout'}
      </Button>
    </details>
  )
}

/** Progress and problems for files being read: password prompts, unreadable files. */
export function Jobs({ showDone = false }: { showDone?: boolean }) {
  const jobs = useStore((s) => s.jobs).filter((j) => showDone || j.status !== 'done')
  const dismiss = useStore((s) => s.dismissJob)
  const openMapping = useStore((s) => s.openMapping)
  if (!jobs.length) return null
  return (
    <ul className="space-y-2" aria-live="polite">
      {jobs.map((j) => {
        const icon =
          j.status === 'reading' ? <LoaderCircle size={18} className="animate-spin text-brand-text" /> :
          j.status === 'done' ? <Check size={18} className="text-pos" /> :
          j.status === 'password' ? <KeyRound size={18} className="text-ink-2" /> :
          <TriangleAlert size={18} className="text-neg" />
        const status =
          j.status === 'reading' ? 'Reading on this device…' :
          j.status === 'done' ? 'Added' :
          j.status === 'password' ? (j.passwordWrong ? 'Wrong password' : 'Password needed') :
          'Couldn’t read'
        return (
          <li key={j.id} className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted" aria-hidden>
                <FileText size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{j.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  {icon}
                  <span>{status}</span>
                </div>
              </div>
              {j.status !== 'reading' && j.status !== 'done' && (
                <Button size="sm" variant="ghost" onClick={() => dismiss(j.id)} aria-label={`Dismiss ${j.name}`}>
                  Dismiss
                </Button>
              )}
            </div>
            {j.status === 'password' && <PasswordForm job={j} />}
            {j.status === 'error' && (
              <>
                <p className="mt-2 text-sm text-ink-2">{j.message}</p>
                {j.view && (
                  <Button variant="primary" size="sm" className="mt-3" onClick={() => openMapping({ id: j.id, fileName: j.name, view: j.view! })}>
                    Fix columns
                  </Button>
                )}
                {j.anonymizedLayout && <Layout text={j.anonymizedLayout} />}
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
