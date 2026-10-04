import { useSyncExternalStore } from 'react'

/*
 * Counts resource requests made after the app finished loading. Everything the app needs
 * (code, workers, styles) loads with the page; after that this should stay at zero, and the
 * CSP would block anything that tried. Shown in the header as live proof.
 */
let count = 0
let ready = false
const listeners = new Set<() => void>()

export function startNetworkWatch() {
  if (ready || typeof PerformanceObserver === 'undefined') return
  const mark = () => {
    if (ready) return
    ready = true
    try {
      new PerformanceObserver((list) => {
        count += list.getEntries().length
        listeners.forEach((l) => l())
      }).observe({ type: 'resource', buffered: false })
    } catch {
      // Observer unsupported: the CSP still blocks requests; we just can't count them.
    }
    listeners.forEach((l) => l())
  }
  // Workers and their imports finish loading shortly after `load`.
  if (document.readyState === 'complete') setTimeout(mark, 1500)
  else window.addEventListener('load', () => setTimeout(mark, 1500), { once: true })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useRequestsSinceLoad(): number | null {
  return useSyncExternalStore(subscribe, () => (ready ? count : null))
}
