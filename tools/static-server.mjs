// Minimal static server that behaves like GitHub Pages for this app: serves dist/ under a
// sub-path and sends NO security headers, so tests prove the in-page protections alone.
// Usage: node tools/static-server.mjs <port> <base>   e.g. 4182 /kharcha-lens/
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const port = Number(process.argv[2] ?? 4182)
const base = process.argv[3] ?? '/kharcha-lens/'
const root = join(process.cwd(), 'dist')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  if (!url.startsWith(base)) {
    res.writeHead(404).end('Not found')
    return
  }
  let file = normalize(join(root, url.slice(base.length)))
  if (!file.startsWith(root)) {
    res.writeHead(403).end()
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404).end('Not found')
    return
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(port, () => console.log(`static (GitHub Pages-like) on http://localhost:${port}${base}`))
