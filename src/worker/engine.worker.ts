/// <reference lib="webworker" />
import './lockdown' // first: no network APIs for anything below
import * as Comlink from 'comlink'
import { parseGridStatement, parsePdfStatement, StatementError } from '../engine/parse'
import { csvToGrid, workbookToGrids } from '../engine/sheet'
import { detectHeader, GENERIC_PROFILE } from '../engine/profiles'
import { parseLeadingDate } from '../engine/dates'
import type { CustomLayout, GridView } from '../engine/gridView'
import type { ParseResult, PdfPageText } from '../engine/types'

export type WorkerOutcome =
  | { ok: true; result: ParseResult }
  | { ok: false; code: StatementError['code'] | 'FAILED'; message: string; anonymizedLayout?: string; view?: GridView }

function wrap(fn: () => ParseResult): WorkerOutcome {
  try {
    return { ok: true, result: fn() }
  } catch (e) {
    if (e instanceof StatementError) return { ok: false, code: e.code, message: e.message, anonymizedLayout: e.anonymizedLayout, view: e.view }
    return { ok: false, code: 'FAILED', message: e instanceof Error ? e.message : String(e) }
  }
}

const api = {
  parsePdf(fileName: string, pages: PdfPageText[], id: string, layouts: CustomLayout[] = []): WorkerOutcome {
    return wrap(() => parsePdfStatement(fileName, pages, id, layouts))
  },
  parseSheet(fileName: string, bytes: ArrayBuffer, kind: 'csv' | 'xlsx', id: string, layouts: CustomLayout[] = []): WorkerOutcome {
    return wrap(() => {
      if (kind === 'csv') return parseGridStatement(fileName, csvToGrid(new TextDecoder().decode(bytes)), id, layouts)
      const grids = workbookToGrids(bytes)
      // The first sheet with known column titles; otherwise the one with the most dates.
      const dates = (g: string[][]) => g.slice(0, 300).reduce((n, r) => n + r.filter((c) => parseLeadingDate(c)).length, 0)
      const grid =
        grids.find((g) => g.some((row) => detectHeader(row, GENERIC_PROFILE))) ??
        [...grids].sort((a, b) => dates(b) - dates(a))[0] ??
        []
      return parseGridStatement(fileName, grid, id, layouts)
    })
  },
}

export type EngineApi = typeof api
Comlink.expose(api)
