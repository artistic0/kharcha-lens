/// <reference lib="webworker" />
import './lockdown' // first: no network APIs for anything below
import * as Comlink from 'comlink'
import { parseGridStatement, parsePdfStatement, StatementError } from '../engine/parse'
import { csvToGrid, workbookToGrids } from '../engine/sheet'
import { detectHeader, GENERIC_PROFILE } from '../engine/profiles'
import type { ParseResult, PdfPageText } from '../engine/types'

export type WorkerOutcome =
  | { ok: true; result: ParseResult }
  | { ok: false; code: StatementError['code'] | 'FAILED'; message: string; anonymizedLayout?: string }

function wrap(fn: () => ParseResult): WorkerOutcome {
  try {
    return { ok: true, result: fn() }
  } catch (e) {
    if (e instanceof StatementError) return { ok: false, code: e.code, message: e.message, anonymizedLayout: e.anonymizedLayout }
    return { ok: false, code: 'FAILED', message: e instanceof Error ? e.message : String(e) }
  }
}

const api = {
  parsePdf(fileName: string, pages: PdfPageText[], id: string): WorkerOutcome {
    return wrap(() => parsePdfStatement(fileName, pages, id))
  },
  parseSheet(fileName: string, bytes: ArrayBuffer, kind: 'csv' | 'xlsx', id: string): WorkerOutcome {
    return wrap(() => {
      if (kind === 'csv') return parseGridStatement(fileName, csvToGrid(new TextDecoder().decode(bytes)), id)
      const grids = workbookToGrids(bytes)
      // Use the first sheet that has a transaction header.
      const grid = grids.find((g) => g.some((row) => detectHeader(row, GENERIC_PROFILE))) ?? grids[0] ?? []
      return parseGridStatement(fileName, grid, id)
    })
  },
}

export type EngineApi = typeof api
Comlink.expose(api)
