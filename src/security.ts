/**
 * The privacy promise, as HTTP headers. One source of truth for:
 *  - public/_headers (Cloudflare Pages), generated at build
 *  - `vite preview` (so local tests run under the production policy)
 *  - the <meta> CSP baked into the built index.html (defence in depth)
 *  - the Privacy page, which shows this exact text
 */

/** The page may load its own files and nothing else; connect-src 'none' blocks every fetch/XHR/WebSocket/beacon. */
export const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ')

/** The service worker only needs to read the site's own static files into its cache. */
export const SW_CSP = ["default-src 'none'", "script-src 'self'", "connect-src 'self'"].join('; ')

export const COMMON_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), hid=()',
}

export function headersFor(path: string, base = '/'): Record<string, string> {
  const csp = path === `${base}sw.js` ? SW_CSP : PAGE_CSP
  return { ...COMMON_HEADERS, 'Content-Security-Policy': csp }
}

/** Cloudflare Pages `_headers` file. `! Header` detaches the site-wide value for sw.js. */
export function renderHeadersFile(base = '/'): string {
  const block = (h: Record<string, string>) =>
    Object.entries(h)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n')
  return [
    '/*',
    block(headersFor('/', base)),
    '',
    `${base}sw.js`,
    '  ! Content-Security-Policy',
    `  Content-Security-Policy: ${SW_CSP}`,
    '  Cache-Control: no-cache',
    '',
  ].join('\n')
}
