/**
 * The craft sweep's capture: every page in every state the data has, at
 * desktop and phone width, as full-page screenshots cut into readable slices,
 * with a manifest a reviewer can work from. Needs the built site served at
 * :4100 and a database file to import (a copy of real data).
 *   node web/spike/sweep.mjs <out-dir> <db-file>
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const [out, dbFile] = process.argv.slice(2)
const base = 'http://127.0.0.1:4100'
const APPS = {
  drafting: 'app_7b204c4b-af80-427c-90eb-b6fc93e7a46a',
  sent: 'app_313b9548-7dd5-4572-aa4b-a0a258930b77',
  replied: 'app_b60314e4-082f-437a-be25-b0f18824c0bf',
  rejected: 'app_dd14d62d-1f54-44e5-98e1-91b5f9caf805',
  ghosted: 'app_b9a36d0b-43e7-4ddf-ac10-5267a4de0474',
  interviewed: 'app_799c62ac-c018-46d6-a054-31d48da4272c',
  offer: 'app_22e95970-afc1-424e-9a84-ba07ce9001bb',
  withdrawn: 'app_7d9317de-50a4-41a9-bba9-a681bd4af089',
  archivedNoCv: 'app_4bb1bc80-0cea-4b2c-95a2-aa90e076b5fc',
  archivedCv: 'app_f88660ce-c0ad-4698-ba15-428a5e3c0c12',
  closedNoCv: 'app_2f845652-986b-413b-bdc6-a57e9ffd2433',
}
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: {
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  },
}
const SLICE = { desktop: 1100, phone: 1400 }

/** Each shot: a name, a path, and an optional action before the capture. */
const SHOTS = [
  { name: 'hoy', path: '/' },
  { name: 'hoy-sample', path: '/?sample=1' },
  { name: 'analizar', path: '/share/' },
  { name: 'experiencia', path: '/evidence/' },
  { name: 'experiencia-ampliar', path: '/evidence/interview/exp_1/' },
  { name: 'experiencia-importar', path: '/evidence/import/' },
  { name: 'cv-base', path: '/cvs/' },
  { name: 'postulaciones', path: '/pipeline/' },
  { name: 'postulaciones-cerradas', path: '/pipeline/?status=closed' },
  { name: 'postulaciones-descartadas', path: '/pipeline/?show=skipped' },
  { name: 'postulaciones-busqueda-vacia', path: '/pipeline/?q=zzzz' },
  { name: 'numeros', path: '/stats/' },
  { name: 'ajustes', path: '/settings/' },
  { name: 'privacidad', path: '/privacidad/' },
  ...Object.entries(APPS).map(([k, id]) => ({ name: `app-${k}`, path: `/application/${id}/` })),
  {
    name: 'app-drafting-porque',
    path: `/application/${APPS.drafting}/`,
    act: async (p) => tap(p.locator('.story-why > summary').first()),
  },
  {
    name: 'app-drafting-requisito',
    path: `/application/${APPS.drafting}/`,
    act: async (p) => {
      await tap(p.locator('.story-why > summary').first())
      await tap(p.locator('.req-chips .chips button').first())
    },
    viewportOnly: true,
  },
  {
    name: 'app-drafting-que-significa',
    path: `/application/${APPS.drafting}/`,
    act: async (p) => p.locator('.verdict-explain').first().click(),
    viewportOnly: true,
  },
  { name: 'app-drafting-faltan', path: `/application/${APPS.drafting}/gaps/` },
  ...['Carta', 'Respuestas', 'Mensaje'].map((tab) => ({
    name: `app-replied-${tab.toLowerCase()}`,
    path: `/application/${APPS.replied}/?step=docs`,
    act: async (p) => p.getByRole('tab', { name: tab }).first().click(),
  })),
  {
    name: 'app-replied-vacante',
    path: `/application/${APPS.replied}/`,
    act: async (p) =>
      p
        .getByRole('button', { name: /Ver vacante/ })
        .first()
        .click(),
    viewportOnly: true,
  },
]

/** Clicks after centring the target: on a phone, a minimal scroll parks it under the floating bar. */
async function tap(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await locator.click()
}

async function settle(p) {
  await p.waitForLoadState('networkidle').catch(() => {})
  await p.waitForTimeout(1200)
}

async function capture(p, name, vp, viewportOnly) {
  const file = path.join(out, `${vp}--${name}`)
  if (viewportOnly) {
    await p.screenshot({ path: `${file}--1.png` })
    return [`${vp}--${name}--1.png`]
  }
  const height = await p.evaluate(() => document.documentElement.scrollHeight)
  const width = VIEWPORTS[vp].viewport.width
  const files = []
  for (let y = 0, i = 1; y < height && i <= 8; y += SLICE[vp], i++) {
    const f = `${vp}--${name}--${i}.png`
    await p.screenshot({
      path: path.join(out, f),
      fullPage: true,
      clip: { x: 0, y, width, height: Math.min(SLICE[vp], height - y) },
    })
    files.push(f)
  }
  return files
}

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
const manifest = []
const bytes = Array.from(await readFile(dbFile))

for (const vp of Object.keys(VIEWPORTS)) {
  const profile = path.join(out, `.profile-${vp}`)
  const ctx = await chromium.launchPersistentContext(profile, { ...VIEWPORTS[vp], locale: 'es-MX' })
  const p = await ctx.newPage()
  await p.addInitScript(() => {
    const s = document.createElement('style')
    s.textContent = 'nextjs-portal{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
  })

  // First run (empty browser): the key step.
  await p.goto(`${base}/`)
  await p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
  await settle(p)
  manifest.push({ vp, name: 'primera-vez-clave', files: await capture(p, 'primera-vez-clave', vp) })

  await p.evaluate((b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)), bytes)
  for (const shot of SHOTS) {
    try {
      await p.goto(base + shot.path)
      await settle(p)
      if (shot.act) {
        await shot.act(p)
        await p.waitForTimeout(700)
      }
      manifest.push({
        vp,
        name: shot.name,
        path: shot.path,
        files: await capture(p, shot.name, vp, shot.viewportOnly),
      })
    } catch (err) {
      manifest.push({ vp, name: shot.name, error: String(err).slice(0, 200) })
    }
  }

  // The password screen.
  await p.goto(`${base}/settings/`)
  await settle(p)
  try {
    await p.evaluate(() => window.cvforgeDebug.protect('una frase de prueba'))
    await p.reload()
    await settle(p)
    manifest.push({ vp, name: 'bloqueado', files: await capture(p, 'bloqueado', vp) })
  } catch (err) {
    manifest.push({ vp, name: 'bloqueado', error: String(err).slice(0, 200) })
  }
  await ctx.close()
  await rm(profile, { recursive: true, force: true })
}

await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1))
const files = manifest.flatMap((m) => m.files ?? [])
console.log(`${manifest.length} states, ${files.length} images`)
for (const m of manifest.filter((m) => m.error)) console.log(`ERROR ${m.vp} ${m.name}: ${m.error}`)
