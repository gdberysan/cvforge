// A static server that behaves like the host for web/site (landing + app under /app):
// directories serve index.html, and web/public/_redirects' 200 rewrites apply.

import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

const root = path.resolve(process.env.WEB_ROOT ?? 'web/site')
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.txt': 'text/x-component',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}
// Cloudflare Pages' _headers: a path pattern, then indented "Name: value" lines.
const headerRules = []
try {
  let current = null
  for (const line of (await readFile(path.join(root, '_headers'), 'utf8')).split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    if (!/^\s/.test(line)) {
      current = { re: new RegExp(`^${line.trim().replace(/\*/g, '.*')}$`), headers: {} }
      headerRules.push(current)
    } else if (current) {
      const i = line.indexOf(':')
      current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
} catch {}
const headersFor = (p) =>
  Object.assign({}, ...headerRules.filter((r) => r.re.test(p)).map((r) => r.headers))
const rules = (await readFile(path.join(root, '_redirects'), 'utf8'))
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => l.trim().split(/\s+/))
function rewrite(p) {
  for (const [from, to] of rules) {
    const re = new RegExp(`^${from.replace(/\*/g, '([^/]+)')}(.*)$`)
    const m = p.match(re)
    if (m && !p.startsWith(to)) return to + (m[m.length - 1] ?? '').replace(/^\//, '')
  }
  return p
}
export function serve(port) {
  return createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    let f = path.join(root, url)
    try {
      if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html')
    } catch {
      f = path.join(root, rewrite(url))
      try {
        if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html')
      } catch {}
    }
    let body
    try {
      body = await readFile(f)
    } catch {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, {
      ...headersFor(url),
      'content-type': types[path.extname(f)] ?? 'application/octet-stream',
    })
    res.end(body)
  }).listen(port, '127.0.0.1')
}
