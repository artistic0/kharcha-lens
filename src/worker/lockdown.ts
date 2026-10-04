/// <reference lib="webworker" />
/**
 * Remove every network API from this worker before any library code runs.
 *
 * A worker takes its Content-Security-Policy from its own HTTP response, not from the page.
 * On hosts that can't send headers (GitHub Pages), the page's <meta> CSP therefore doesn't
 * reach the PDF and spreadsheet workers. This makes them unable to send anything anyway.
 * Import it first in every worker entry.
 */
// A plain function (not an arrow) so `new WebSocket(...)` reaches the throw with this message.
function denied(): never {
  throw new TypeError('Network access is disabled in KharchaLens.')
}
const deniedFetch = () => Promise.reject(new TypeError('Network access is disabled in KharchaLens.'))

const scope = self as unknown as Record<string, unknown>
for (const [name, value] of [
  ['fetch', deniedFetch],
  ['XMLHttpRequest', denied],
  ['WebSocket', denied],
  ['EventSource', denied],
  ['WebTransport', denied],
  ['importScripts', denied],
] as const) {
  // Replace it on the global and anywhere up its prototype chain it is defined.
  for (let o: object | null = scope; o; o = Object.getPrototypeOf(o)) {
    if (o !== scope && !Object.prototype.hasOwnProperty.call(o, name)) continue
    try {
      Object.defineProperty(o, name, { value, writable: false, configurable: false })
    } catch {
      // Already locked or not redefinable here: the next level (or CSP) covers it.
    }
  }
}

export {}
