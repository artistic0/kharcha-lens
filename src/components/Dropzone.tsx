import { Lock, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useStore } from '../store'

export function Dropzone({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const addFiles = useStore((s) => s.addFiles)
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (list: FileList | null) => {
    if (list?.length) void addFiles([...list])
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        take(e.dataTransfer.files)
      }}
      className={`group relative flex flex-col items-center rounded-3xl border-2 border-dashed text-center transition ${
        over ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface hover:border-brand/60'
      } ${size === 'lg' ? 'px-6 py-10' : 'px-5 py-7'}`}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv"
        className="sr-only"
        id="statement-input"
        data-testid="file-input"
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
      />
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-text">
        <Upload size={22} />
      </span>
      <p className="text-base font-semibold text-ink">Drop your bank statements here</p>
      <p className="mt-1 text-sm text-muted">PDF, CSV or Excel · several months and banks at once</p>
      <label
        htmlFor="statement-input"
        className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-brand px-5 text-sm font-semibold text-brand-ink shadow-sm transition hover:brightness-110"
      >
        Choose files
      </label>
      <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted">
        <Lock size={12} aria-hidden /> Read inside this tab. Nothing is uploaded.
      </p>
    </div>
  )
}
