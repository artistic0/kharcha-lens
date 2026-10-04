import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './ingest' // starts the PDF and engine workers now, so nothing loads later
import { startNetworkWatch } from './networkWatch'

// Load both font subsets now (₹ lives in latin-ext) so no font is fetched after load.
void document.fonts?.load('600 16px Inter', 'Aa₹').catch(() => {})
startNetworkWatch()

// Cache the app for offline use (production only; the dev server needs the network for HMR).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline caching is a convenience; the app works without it.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
