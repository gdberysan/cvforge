/// <reference types="chrome" />
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type BrowserContext, chromium, type Worker } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The extension's store build (web/extension/dist-store, see
 * scripts/build-extension.ts) in a real Chromium, against a LinkedIn job page
 * served from inside the browser: nothing reaches LinkedIn or Rumbo. Holds
 * the two promises the privacy page makes: nothing is read until the side
 * panel opens, and a posting reaches Rumbo only in the URL's fragment.
 */
const ext = path.resolve('web/extension/dist-store')
const page = (id: string) =>
  `<!doctype html><html lang="en"><head><title>Role ${id} | Acme | LinkedIn</title></head><body>
<h1 class="job-details-jobs-unified-top-card__job-title">Role ${id}</h1>
<div class="job-details-jobs-unified-top-card__company-name">Acme</div>
<div class="jobs-description__content">We need a paid media lead to run search and social for our brands. ${'Plan, test and report every week. '.repeat(6)}</div>
</body></html>`
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

let ctx: BrowserContext
let sw: Worker
let id: string

beforeAll(async () => {
  if (!existsSync(path.join(ext, 'manifest.json'))) {
    throw new Error(
      'No store build: run CVFORGE_SITE=https://rumbo.korven.dev/app/ npm run web:extension and copy dist to dist-store.',
    )
  }
  ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'ext-')), {
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  })
  await ctx.route('https://www.linkedin.com/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: page(
        r
          .request()
          .url()
          .match(/view\/(\d+)/)?.[1] ?? '0',
      ),
    }),
  )
  await ctx.route('https://rumbo.korven.dev/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<p>app</p>' }),
  )
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'))
  id = new URL(sw.url()).host
  // Which tab each LinkedIn page is (the extension has no "tabs" permission to ask).
  await sw.evaluate(() => {
    const g = globalThis as unknown as { __tabs: number[] }
    g.__tabs = []
    chrome.runtime.onConnect.addListener((p) => {
      if (p.name === 'cvforge-page' && p.sender?.tab?.id) g.__tabs.push(p.sender.tab.id)
    })
  })
})
afterAll(async () => {
  await ctx?.close()
})

const session = () => sw.evaluate(() => chrome.storage.session.get(null))
const seen = async (tab: number) =>
  ((await session())[`seen:${tab}`] as { posting?: { url: string } } | undefined)?.posting?.url

describe('the extension', () => {
  it('reads LinkedIn only while its panel is open, and hands the posting over in the fragment', async () => {
    const li = await ctx.newPage()
    await li.goto('https://www.linkedin.com/jobs/view/1111111/')
    await wait(2000)
    const tab = (await sw.evaluate(() => (globalThis as unknown as { __tabs: number[] }).__tabs))[0]
    expect(tab).toBeTypeOf('number')
    expect(Object.keys(await session()).some((k) => k.startsWith('seen:'))).toBe(false)

    const panel = await ctx.newPage()
    await panel.goto(`chrome-extension://${id}/panel.html?tab=${tab}`)
    await wait(1200)
    expect(await seen(tab as number)).toBe('https://www.linkedin.com/jobs/view/1111111/')
    await li.goto('https://www.linkedin.com/jobs/view/2222222/')
    await wait(2500)
    expect(await seen(tab as number)).toBe('https://www.linkedin.com/jobs/view/2222222/')

    await sw.evaluate(
      ([t]) =>
        chrome.storage.session.set({
          [`pending:${t}`]: {
            posting: {
              source: 'linkedin',
              title: 'Role 2222222',
              company: 'Acme',
              location: 'Remote',
              url: 'https://www.linkedin.com/jobs/view/2222222/',
              text: 'x '.repeat(80),
            },
            at: Date.now(),
          },
        }),
      [tab],
    )
    await wait(800)
    const src = (await panel.locator('#site').getAttribute('src')) ?? ''
    expect(src).toContain('#')
    expect(src.split('#')[0]).not.toContain('?')

    await panel.close()
    await wait(1000)
    expect(await seen(tab as number)).toBeUndefined()
    await li.goto('https://www.linkedin.com/jobs/view/3333333/')
    await wait(2500)
    expect(await seen(tab as number)).toBeUndefined()
  })
})
