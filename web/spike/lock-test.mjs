import { readFile } from 'node:fs/promises'
import { chromium, devices } from 'playwright'

const [profileDir, dbCopy] = process.argv.slice(2)
const base = 'http://127.0.0.1:4100'
const ctx = await chromium.launchPersistentContext(profileDir, {
  ...devices['Pixel 7'],
  locale: 'es-MX',
})
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
const ready = () => p.waitForFunction(() => window.cvforgeDebug, null, { timeout: 20000 })
const opfs = () =>
  p.evaluate(async () => {
    const r = await navigator.storage.getDirectory()
    const n = []
    for await (const k of r.keys()) n.push(k)
    return n.sort()
  })
const vaultText = () =>
  p.evaluate(async () => {
    const r = await navigator.storage.getDirectory()
    const f = await (await r.getFileHandle('cvforge.vault')).getFile()
    const b = new Uint8Array(await f.arrayBuffer())
    return {
      size: b.length,
      hasKey: new TextDecoder('latin1').decode(b).includes('sk-ant'),
      hasSqlite: new TextDecoder('latin1').decode(b).includes('SQLite format'),
    }
  })
await p.goto(`${base}/`)
await ready()
await p.evaluate(
  async (b) => window.cvforgeDebug.importDatabase(new Uint8Array(b)),
  Array.from(await readFile(dbCopy)),
)
await p.evaluate(() => window.cvforgeDebug.setApiKey('sk-ant-test-not-a-real-key'))
console.log('1 plain files     :', (await opfs()).join(', '))
await p.goto(`${base}/settings/`)
await p.waitForTimeout(2000)
await p.getByRole('button', { name: 'Proteger con contraseña' }).click()
await p.getByLabel('Nueva contraseña').fill('mi frase larga')
await p.getByLabel('Repítela').fill('mi frase larga')
await p.locator('form.lock-form').getByRole('button', { name: 'Proteger con contraseña' }).click()
await p.getByText('Listo. Tus datos están cifrados.').waitFor({ timeout: 30000 })
console.log('2 protected files :', (await opfs()).join(', '))
console.log('  vault contents  :', JSON.stringify(await vaultText()))
await p.reload()
await p.waitForTimeout(2500)
console.log(
  '3 after reload    :',
  (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 60),
)
await p.getByLabel('Contraseña').fill('equivocada')
await p.getByRole('button', { name: 'Abrir' }).click()
await p.locator('.form-error').waitFor({ timeout: 20000 })
console.log('4 wrong password  :', await p.locator('.form-error').innerText())
await p.getByLabel('Contraseña').fill('mi frase larga')
await p.getByRole('button', { name: 'Abrir' }).click()
await p.getByRole('link', { name: 'Mi experiencia' }).first().waitFor({ timeout: 30000 })
console.log('5 right password  : opened, full nav back')
// In-app navigation keeps it open; a full reload would ask again (as it should).
await p.getByRole('link', { name: 'Hoy' }).first().click()
await p.waitForSelector('.today-greet', { timeout: 30000 })
console.log('  Hoy             :', await p.locator('.today-greet').innerText())
// a database change and a settings change, then wait past the 1 s seal, reload, reopen
const vaultHash = () =>
  p.evaluate(async () => {
    const r = await navigator.storage.getDirectory()
    const f = await (await r.getFileHandle('cvforge.vault')).getFile()
    const d = await crypto.subtle.digest('SHA-256', await f.arrayBuffer())
    return Array.from(new Uint8Array(d)).slice(0, 6).join('.')
  })
const before = await vaultHash()
const app = await p.evaluate(() =>
  window.cvforgeDebug
    .load('pipeline', { search: {} })
    .then((d) => d?.applications?.find((a) => a.status !== 'archived')?.id ?? null),
)
await p.evaluate((id) => window.cvforgeDebug.action('triage', 'skipApplicationAction', [id]), app)
await p.evaluate(() => window.cvforgeDebug.setApiKey(''))
await p.waitForTimeout(1800)
console.log('  vault re-sealed :', before !== (await vaultHash()), '| archived', app)
await p.reload()
await p.waitForTimeout(2000)
await p.getByLabel('Contraseña').fill('mi frase larga')
await p.getByRole('button', { name: 'Abrir' }).click()
await p.waitForSelector('.today-greet', { timeout: 30000 })
const st = await p.evaluate(() => window.cvforgeDebug.status())
const archivedNow = await p.evaluate(
  (id) =>
    window.cvforgeDebug
      .load('pipeline', { search: { show: 'skipped' } })
      .then((d) => Boolean(d?.applications?.some((a) => a.id === id))),
  app,
)
console.log(
  '6 changes survived: key removed',
  !st.hasKey,
  '| application archived',
  archivedNow,
  `| spend $${st.spend.totalUsd.toFixed(2)}`,
)
await p.getByRole('link', { name: 'Ajustes' }).first().click()
await p.waitForTimeout(2000)
await p.getByRole('button', { name: 'Bloquear ahora' }).click()
await p.getByLabel('Contraseña').waitFor({ timeout: 10000 })
console.log('7 lock now        : password screen shown')
await p.getByLabel('Contraseña').fill('mi frase larga')
await p.getByRole('button', { name: 'Abrir' }).click()
await p.getByRole('button', { name: 'Quitar la contraseña' }).waitFor({ timeout: 30000 })
await p.getByRole('button', { name: 'Quitar la contraseña' }).click()
await p.locator('.erase-confirm').getByRole('button', { name: 'Quitar la contraseña' }).click()
await p.getByText('Contraseña quitada.').waitFor({ timeout: 30000 })
console.log('8 unprotected     :', (await opfs()).join(', '))
await p.reload()
await p.waitForTimeout(3000)
const st2 = await p.evaluate(() => window.cvforgeDebug.status())
console.log('9 plain reopen    : profile', st2.hasProfile, '| key', st2.hasKey)
console.log('page errors       :', errors.length ? errors.join(' | ') : 'none')
await ctx.close()
