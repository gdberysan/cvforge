/**
 * Builds the browser extension into web/extension/dist (load it unpacked,
 * or zip it for the Chrome Web Store). CVFORGE_SITE is the web edition's
 * origin — it must be the one the site keeps for good: the person's data
 * lives in that origin's storage, and the panel frames it.
 *
 *   CVFORGE_SITE=https://… npx tsx scripts/build-extension.ts [--test-origin http://127.0.0.1:4006]
 *
 * --test-origin adds a local origin to the LinkedIn matches, for the
 * automated test only; never in a published build.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'
import pkg from '../package.json' with { type: 'json' }

const site = new URL(process.env.CVFORGE_SITE ?? 'http://127.0.0.1:3100').origin
const testAt = process.argv.indexOf('--test-origin')
const testOrigin = testAt > 0 ? new URL(process.argv[testAt + 1] as string).origin : null
const out = path.join('web', 'extension', 'dist')
rmSync(out, { recursive: true, force: true })
mkdirSync(path.join(out, 'icons'), { recursive: true })

await build({
  entryPoints: {
    background: 'web/extension/src/background.ts',
    panel: 'web/extension/src/panel.ts',
  },
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir: out,
  define: { CVFORGE_SITE: JSON.stringify(site) },
  logLevel: 'warning',
})
// Content scripts and injected files are classic scripts, not modules.
await build({
  entryPoints: { content: 'web/extension/src/content.ts', inpage: 'web/extension/src/inpage.ts' },
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outdir: out,
  logLevel: 'warning',
})

const linkedin = ['https://www.linkedin.com/jobs/*']
const manifest = {
  manifest_version: 3,
  name: 'CVForge',
  description:
    'Analyse a job posting against your own experience, in a side panel. Reads the posting you are looking at only when you ask; your data stays in your browser.',
  version: pkg.version.split('-')[0],
  icons: { 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  action: { default_title: 'CVForge' },
  side_panel: { default_path: 'panel.html' },
  background: { service_worker: 'background.js', type: 'module' },
  permissions: ['sidePanel', 'storage', 'activeTab', 'scripting'],
  // The site the panel frames, so its storage is the person's own (not a
  // partitioned copy). Nothing else is requested.
  host_permissions: [`${site}/*`],
  content_scripts: [
    {
      matches: testOrigin ? [...linkedin, `${testOrigin}/*`] : linkedin,
      js: ['content.js'],
      run_at: 'document_idle',
    },
  ],
  content_security_policy: {
    extension_pages: `script-src 'self'; object-src 'self'; frame-src ${site}`,
  },
}
writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
copyFileSync('web/extension/static/panel.html', path.join(out, 'panel.html'))
for (const size of [48, 128]) {
  copyFileSync('public/icons/icon-192.png', path.join(out, 'icons', `icon-${size}.png`))
}
console.log(`extension -> ${out} (site ${site}${testOrigin ? `, test origin ${testOrigin}` : ''})`)
