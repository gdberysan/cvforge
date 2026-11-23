import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const [profileDir, appId] = process.argv.slice(2)
const server = serve(4002)
const ctx = await chromium.launchPersistentContext(profileDir, { locale: 'es-MX' })
const p = await ctx.newPage()
const logs = []
p.on('pageerror', (e) => logs.push(`PAGEERROR ${e.message}`))
p.on('console', (m) => logs.push(`${m.type()} ${m.text()}`))
await p.goto(`http://127.0.0.1:4002/application/${appId}/?step=send`)
await p.getByRole('link', { name: 'DOCX' }).waitFor({ timeout: 20000 })
console.log(
  await p.evaluate(async (id) => {
    const r = await fetch(`/api/export/docx?applicationId=${id}`)
    const b = await r.arrayBuffer()
    return `status ${r.status} type ${r.headers.get('content-type')} disp ${r.headers.get('content-disposition')} bytes ${b.byteLength}`
  }, appId),
)
console.log('href:', await p.getByRole('link', { name: 'DOCX' }).getAttribute('href'))
console.log(logs.slice(0, 6).join('\n'))
await ctx.close()
server.close()
