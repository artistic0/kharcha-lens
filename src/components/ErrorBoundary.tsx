import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
  copied: boolean
}

/**
 * If anything in the UI crashes, show a calm screen instead of a blank page. The copyable
 * details are the error and where it happened — never statement data.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept on this device: shown to the user, never sent anywhere.
    console.error(error, info.componentStack)
  }

  details(): string {
    const e = this.state.error
    return [`KharchaLens ${__APP_VERSION__}`, `${e?.name}: ${e?.message}`, (e?.stack ?? '').split('\n').slice(0, 8).join('\n')].join('\n')
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-6 text-ink">
        <div className="card w-full max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-2">
            KharchaLens hit an unexpected problem. Your statements were never uploaded, so nothing is lost anywhere — reloading starts fresh.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => location.reload()} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink">
              Reload
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(this.details()).then(() => this.setState({ copied: true }))}
              className="min-h-10 rounded-xl border border-line px-4 text-sm font-medium"
            >
              {this.state.copied ? 'Copied' : 'Copy error details'}
            </button>
          </div>
          <p className="mt-4 text-xs text-muted">The details contain the error message and code location only — no transactions.</p>
        </div>
      </div>
    )
  }
}
