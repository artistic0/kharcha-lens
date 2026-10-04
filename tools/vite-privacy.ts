import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import { headersFor, PAGE_CSP, renderHeadersFile } from '../src/security.ts'

/**
 * Build-time privacy plumbing:
 *  - bakes the CSP into index.html as a <meta> tag (build only; dev needs inline HMR scripts)
 *  - writes Cloudflare's _headers file
 *  - serves the same headers from `vite preview`
 *  - generates a tiny cache-first service worker that precaches every built file, so the
 *    app works offline after the first visit and never needs the network again
 */
export function privacy(): Plugin {
  return {
    name: 'kharcha-privacy',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.server) return html // dev server: HMR needs inline scripts
        const csp = PAGE_CSP.replace(/; frame-ancestors 'none'/, '') // not allowed in <meta>
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
      },
    },
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: '_headers', source: renderHeadersFile() })
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== '_headers')
      const assets = ['/', ...files.map((f) => `/${f}`), '/favicon.svg', '/manifest.webmanifest']
      const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(version, assets) })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0]
        for (const [k, v] of Object.entries(headersFor(path))) res.setHeader(k, v)
        if (path === '/sw.js') res.setHeader('Cache-Control', 'no-cache')
        next()
      })
    },
  }
}

function serviceWorker(version: string, assets: string[]): string {
  return `// Generated at build. Cache-first: after the first visit nothing is fetched again.
const CACHE = 'kharcha-${version}'
const ASSETS = ${JSON.stringify(assets)}
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  e.respondWith(
    // ignoreVary: module scripts carry an Origin header the precache requests didn't.
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) => hit || (req.mode === 'navigate' ? caches.match('/', { ignoreVary: true }) : fetch(req)),
    ),
  )
})
`
}
