import Papa from 'papaparse'
import * as XLSX from 'xlsx'

/** Read CSV text into a grid of strings. */
export function csvToGrid(text: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: false })
  return res.data.map((r) => r.map((c) => (c ?? '').toString()))
}

/** Read the first sheet that contains a transaction-looking table from an XLS/XLSX file. */
export function workbookToGrids(data: ArrayBuffer | Uint8Array): string[][][] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false, cellText: true, dense: true })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: true })
    return rows.map((r) => r.map((c) => (c ?? '').toString()))
  })
}
