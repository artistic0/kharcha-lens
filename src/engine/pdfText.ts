import type { PdfPageText } from './types'

/** The slice of the pdf.js API we use, so the browser build and Node tests can both pass theirs in. */
export interface PdfJsLike {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDocLike>; destroy(): Promise<void> }
}
interface PdfDocLike {
  numPages: number
  getPage(n: number): Promise<PdfPageLike>
}
interface PdfPageLike {
  getViewport(o: { scale: number }): { width: number; height: number }
  getTextContent(): Promise<{ items: unknown[] }>
  cleanup(): void
}
interface TextItemLike {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

export class PdfPasswordError extends Error {
  incorrect: boolean
  constructor(incorrect: boolean) {
    super(incorrect ? 'That password did not open the PDF.' : 'This PDF is password-protected.')
    this.incorrect = incorrect
  }
}

/**
 * Pull positioned text out of every page. The password, if any, is used once to open the
 * file and is never stored.
 */
export async function extractPdfText(pdfjs: PdfJsLike, data: Uint8Array, password?: string): Promise<PdfPageText[]> {
  const task = pdfjs.getDocument({
    data,
    password,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  })
  let doc: PdfDocLike
  try {
    doc = await task.promise
  } catch (e) {
    await task.destroy().catch(() => {})
    const err = e as { name?: string; code?: number }
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2)
    throw e
  }
  try {
    const pages: PdfPageText[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const { width, height } = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items = (content.items as TextItemLike[])
        .filter((it) => typeof it.str === 'string' && it.str.trim() !== '' && it.transform)
        .map((it) => {
          const [, , , d, e, f] = it.transform!
          const h = Math.abs(it.height || d || 8)
          // y is the text baseline measured from the top: items on one visual line share it.
          return { s: it.str!, x: e, y: height - f, w: it.width ?? 0, h }
        })
      pages.push({ page: n, width, height, items })
      page.cleanup()
    }
    return pages
  } finally {
    await task.destroy()
  }
}
