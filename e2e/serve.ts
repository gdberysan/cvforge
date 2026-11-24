import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import path from 'node:path'

/**
 * The built site (web/site) served the way the host serves it: a path is its
 * file, or its folder's index.html; anything else is the site's 404 page.
 * The trial routes are not served here: each test answers them itself.
 */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
}

export function serveSite(root: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let file = path.join(root, decodeURIComponent(url.pathname))
    if (!file.startsWith(root)) {
      res.writeHead(403).end()
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html')
    else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`
    if (!existsSync(file)) {
      const missing = path.join(root, '404.html')
      res.writeHead(404, { 'content-type': TYPES['.html'] ?? '' })
      res.end(existsSync(missing) ? readFileSync(missing) : 'not found')
      return
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}
