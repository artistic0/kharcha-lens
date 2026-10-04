import { ChevronDown, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onHero'

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-brand text-brand-ink shadow-sm hover:brightness-110',
    secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
    ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    danger: 'text-neg hover:bg-surface-2',
    onHero: 'bg-white/15 text-white hover:bg-white/25',
  }
  const sizes = { sm: 'min-h-8 px-2.5 text-xs gap-1', md: 'min-h-10 px-3.5 text-sm gap-1.5', lg: 'min-h-12 px-5 text-base gap-2' }
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-xl font-medium transition disabled:opacity-50 ${styles[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/** Status is never color alone: an icon glyph and a word always come with it. */
export function StatusPill({ tone, children }: { tone: 'good' | 'warning' | 'critical' | 'neutral' | 'info'; children: ReactNode }) {
  const map = {
    good: { icon: '✓', color: 'var(--good)', bg: 'color-mix(in srgb, var(--good-mark) 14%, transparent)' },
    warning: { icon: '!', color: 'var(--ink)', bg: 'color-mix(in srgb, var(--warning) 30%, transparent)' },
    critical: { icon: '×', color: 'var(--critical)', bg: 'color-mix(in srgb, var(--critical) 14%, transparent)' },
    neutral: { icon: '•', color: 'var(--ink-2)', bg: 'var(--surface-2)' },
    info: { icon: 'i', color: 'var(--brand-text)', bg: 'var(--brand-soft)' },
  }[tone]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap" style={{ color: map.color, background: map.bg }}>
      <span aria-hidden className="font-bold">
        {map.icon}
      </span>
      {children}
    </span>
  )
}

/** Native select dressed as a pill, so it stays accessible and phone-friendly. */
export function PillSelect({
  label,
  value,
  onChange,
  children,
  hideLabel = false,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
  hideLabel?: boolean
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className={hideLabel ? 'sr-only' : 'text-xs font-medium text-muted'}>{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-10 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface py-2 pr-9 pl-3.5 text-sm font-medium text-ink shadow-sm hover:border-line-strong"
        >
          {children}
        </select>
        <ChevronDown aria-hidden size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Card({ title, subtitle, action, children, className = '', pad = true }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${pad ? 'p-5 sm:p-6' : ''} ${className}`}>
      {(title || action) && (
        <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${pad ? '' : 'px-5 pt-5 sm:px-6 sm:pt-6'}`}>
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-2xl bg-surface-2 p-3 text-muted">{icon}</div>}
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children && <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Modal built on <dialog>: focus trap, Esc to close and backdrop come from the browser. */
export function Dialog({ open, onClose, title, children, footer, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
      className={`m-auto w-[calc(100%-24px)] ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

/** Side panel on desktop, bottom sheet on phones. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[88vh] w-full max-w-none rounded-t-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-3xl"
    >
      {open && (
        <div className="flex h-full max-h-[88vh] flex-col sm:max-h-none">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto px-5 pt-2 pb-8">{children}</div>
        </div>
      )}
    </dialog>
  )
}
