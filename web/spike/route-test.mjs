import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const server = serve(3999)
const ctx = await chromium.launchPersistentContext(process.argv[2])
const p = await ctx.newPage()
const reqs = []
p.on('response', (r) => {
  if (r.url().includes('/application/')) reqs.push(`${r.status()} ${new URL(r.url()).pathname}`)
})
await p.goto('http://127.0.0.1:3999/application/abc123/?step=decide')
console.log('hard load   :', await p.getByTestId('app-id').innerText())
await p.goto('http://127.0.0.1:3999/')
await p.waitForTimeout(3000)
await p.evaluate(() => window.next.router.push('/application/xyz789/?step=cv'))
await p
  .waitForFunction(
    () => document.querySelector('[data-testid=app-id]')?.textContent === 'xyz789',
    null,
    { timeout: 15000 },
  )
  .catch(() => {})
console.log(
  'client nav  :',
  await p
    .getByTestId('app-id')
    .innerText()
    .catch(() => 'NOT RENDERED'),
  '| url',
  new URL(p.url()).pathname,
)
console.log('requests    :', reqs.join(', '))
await ctx.close()
server.close()
