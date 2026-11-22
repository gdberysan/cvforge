/**
 * Builds the web edition's Worker with esbuild into web/public/worker/, next
 * to sqlite3.wasm, before `next build web`. Turbopack cannot bundle
 * sqlite-wasm (it follows a dynamic `new Worker(new URL(…))` in an OPFS mode
 * the app never uses); esbuild does, and the page only ever imports the
 * Worker's types. The same aliases as web/next.config.ts.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const out = path.join('web', 'public', 'worker')
mkdirSync(out, { recursive: true })
await build({
  entryPoints: [process.env.WEB_WORKER_ENTRY ?? 'web/worker/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: process.argv.includes('--minify'),
  sourcemap: true,
  outfile: path.join(out, 'cvforge-worker.js'),
  alias: {
    // What only a server has, swapped for the Worker's own (web/worker/shims).
    'next/server': './web/worker/shims/next-server.ts',
    'next/cache': './web/worker/shims/next-cache.ts',
    '@/lib/i18n/server': './web/worker/shims/i18n-server.ts',
    '@/lib/db/client': './web/worker/shims/db-client.ts',
    '@/lib/http/doors': './web/worker/shims/http-guards.ts',
    '@/lib/http/same-origin': './web/worker/shims/http-guards.ts',
    '@/lib/http/mac-only': './web/worker/shims/http-guards.ts',
    '@/lib/push/notify': './web/worker/shims/push-notify.ts',
    'node:fs': './web/worker/shims/node-fs.ts',
    'node:path': './web/worker/shims/node-fs.ts',
    '@/lib/settings': './web/lib/settings.ts',
    'better-sqlite3': './web/lib/better-sqlite3-stub.ts',
    '#discover': './lib/discover/stub.ts',
    '@': '.',
  },
  // Desktop code reads process.env (demo mode, model overrides); in the
  // Worker there is no environment, so every lookup is simply unset.
  banner: { js: 'globalThis.process ??= { env: {} };' },
  logLevel: 'warning',
})
copyFileSync(
  path.join('node_modules', '@sqlite.org', 'sqlite-wasm', 'dist', 'sqlite3.wasm'),
  path.join(out, 'sqlite3.wasm'),
)
console.log(`web worker -> ${out}`)
