import { phone } from './phone.mjs'

const { browser, page } = await phone()
if (!page.url().includes('localhost:4100')) await page.goto('http://localhost:4100/')
await page.waitForTimeout(3000)
console.log('url     :', page.url())
console.log('ua      :', await page.evaluate(() => navigator.userAgent))
console.log(
  'screen  :',
  (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300),
)
console.log(
  'features:',
  JSON.stringify(
    await page.evaluate(async () => ({
      secure: isSecureContext,
      opfs: typeof navigator.storage?.getDirectory === 'function',
      locks: 'locks' in navigator,
      sw: 'serviceWorker' in navigator,
      swControlled: !!navigator.serviceWorker?.controller,
      wakeLock: 'wakeLock' in navigator,
      persisted: await navigator.storage.persisted(),
      quotaMB: Math.round(((await navigator.storage.estimate()).quota ?? 0) / 1e6),
      debug: typeof window.cvforgeDebug,
    })),
  ),
)
await browser.close()
