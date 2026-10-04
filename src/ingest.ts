import * as Comlink from 'comlink'
import * as pdfjs from 'pdfjs-dist'
import { extractPdfText, PdfPasswordError, type PdfJsLike } from './engine/pdfText'
import type { EngineApi, WorkerOutcome } from './worker/engine.worker'

/*
 * Both workers start immediately, so every file the app will ever need is loaded with the
 * page. After that the app makes no requests at all (the footer counter proves it).
 */
pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./worker/pdf.worker.ts', import.meta.url), {
  type: 'module',
})
const engine = Comlink.wrap<EngineApi>(
  new Worker(new URL('./worker/engine.worker.ts', import.meta.url), { type: 'module' }),
)

export type IngestOutcome = WorkerOutcome | { ok: false; code: 'PASSWORD'; message: string; incorrect: boolean }

export type FileKind = 'pdf' | 'csv' | 'xlsx' | null

export function kindOf(file: File): FileKind {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (n.endsWith('.csv') || file.type === 'text/csv') return 'csv'
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'xlsx'
  return null
}

/** Read a statement file entirely in this tab. The password is used once and dropped. */
export async function ingestFile(file: File, id: string, password?: string): Promise<IngestOutcome> {
  const kind = kindOf(file)
  if (!kind) {
    return { ok: false, code: 'UNSUPPORTED', message: 'Only PDF, CSV, XLS and XLSX statements are supported.' }
  }
  const bytes = await file.arrayBuffer()
  if (kind === 'pdf') {
    let pages
    try {
      pages = await extractPdfText(pdfjs as unknown as PdfJsLike, new Uint8Array(bytes), password)
    } catch (e) {
      if (e instanceof PdfPasswordError) return { ok: false, code: 'PASSWORD', message: e.message, incorrect: e.incorrect }
      return { ok: false, code: 'FAILED', message: `Couldn't read this PDF: ${e instanceof Error ? e.message : String(e)}` }
    }
    return engine.parsePdf(file.name, pages, id)
  }
  return engine.parseSheet(file.name, Comlink.transfer(bytes, [bytes]), kind, id)
}
