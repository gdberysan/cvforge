import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

process.env.CVFORGE_CONFIG_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), 'cvforge-quiet-')),
  'config.json',
)
const route = await import('@/app/api/push/quiet/route')
const post = (body: unknown) =>
  route.POST(
    new Request('http://localhost:3000/api/push/quiet', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )

describe('quiet hours route', () => {
  it('reports the default until changed, then the saved hours', async () => {
    expect(await (await route.GET()).json()).toEqual({ start: 22, end: 8 })
    expect((await post({ start: 23, end: 7 })).status).toBe(200)
    expect(await (await route.GET()).json()).toEqual({ start: 23, end: 7 })
  })

  it('refuses hours outside 0–23', async () => {
    expect((await post({ start: 24, end: 7 })).status).toBe(400)
    expect((await post({ start: 'x', end: 7 })).status).toBe(400)
  })
})
