import { describe, expect, it, vi } from 'vitest'
import { checkBody, handleTrial, type TrialConfig, worstCaseUsd } from '@/web/trial/proxy'
import { memoryStore } from '@/web/trial/store'
import { issueToken, readToken } from '@/web/trial/token'

const SECRET = 'test-secret-not-real'
const NOW = Date.UTC(2026, 10, 23, 12)

function upstreamReturning(usage: Record<string, number>, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }], usage }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )
}

function config(over: Partial<TrialConfig> = {}): TrialConfig {
  let n = 0
  return {
    secret: SECRET,
    anthropicKey: 'upstream-key-placeholder',
    store: memoryStore(),
    open: true,
    budgetUsd: 1.25,
    monthlyUsd: 90,
    startsPerAddressPerDay: 3,
    callsPerAddressPerHour: 60,
    now: () => NOW,
    upstream: upstreamReturning({ input_tokens: 10_000, output_tokens: 4_000 }) as never,
    randomId: () => `trialid${String(++n).padStart(12, '0')}`,
    ...over,
  }
}

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: 'claude-opus-5',
    max_tokens: 16_000,
    messages: [{ role: 'user', content: 'hola' }],
    ...over,
  })

const post = (path: string, init: { body?: string; key?: string } = {}) =>
  new Request(`https://rumbo.test${path}`, {
    method: 'POST',
    headers: init.key ? { 'x-api-key': init.key } : {},
    body: init.body ?? '',
  })

async function startTrial(c: TrialConfig, address = '1.1.1.1'): Promise<string> {
  const res = await handleTrial(post('/api/trial?op=start'), address, c)
  expect(res.status).toBe(200)
  return ((await res.json()) as { token: string }).token
}

describe('trial pass', () => {
  it('reads back the id it was issued with, and nothing forged or expired', async () => {
    const token = await issueToken(SECRET, 'abcdefghijklmnop', NOW + 1000)
    expect(await readToken(SECRET, token, NOW)).toBe('abcdefghijklmnop')
    expect(await readToken('other-secret', token, NOW)).toBeNull()
    expect(
      await readToken(SECRET, token.replace('abcdefghijklmnop', 'abcdefghijklmnoq'), NOW),
    ).toBeNull()
    expect(await readToken(SECRET, token, NOW + 2000)).toBeNull()
    expect(await readToken(SECRET, 'sk-ant-whatever', NOW)).toBeNull()
  })
})

describe('the free trial', () => {
  it('is closed when anything it needs is missing', async () => {
    for (const missing of ['secret', 'anthropicKey', 'store'] as const) {
      const res = await handleTrial(
        post('/trial/start'),
        '1.1.1.1',
        config({ [missing]: undefined }),
      )
      expect(res.status).toBe(503)
    }
    expect(
      (await handleTrial(post('/trial/start'), '1.1.1.1', config({ open: false }))).status,
    ).toBe(503)
  })

  it('forwards the call with the real key and charges the trial', async () => {
    const c = config()
    const token = await startTrial(c)
    const res = await handleTrial(
      post('/api/trial?op=messages', { body: body(), key: token }),
      '1.1.1.1',
      c,
    )
    expect(res.status).toBe(200)
    const [url, init] = (c.upstream as ReturnType<typeof vi.fn>).mock.calls[0] ?? []
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const sent = (init as RequestInit | undefined)?.headers as Record<string, string> | undefined
    expect(sent?.['x-api-key']).toBe('upstream-key-placeholder')
    // 10k in + 4k out on Opus = $0.05 + $0.10.
    expect(res.headers.get('x-trial-left')).toBe('1.10')
    // Settled to the real cost: nothing of the reservation is left over.
    expect(await c.store?.get('trial:trialid000000000001')).toBeCloseTo(0.15, 6)
  })

  it('ends a trial once its budget is spent, before calling Anthropic', async () => {
    const c = config({ budgetUsd: 0.5 })
    const token = await startTrial(c)
    // Each call reserves ~$0.10 (4,000 output tokens) and settles at $0.15.
    const call = () =>
      handleTrial(
        post('/trial/v1/messages', { body: body({ max_tokens: 4_000 }), key: token }),
        '1.1.1.1',
        c,
      )
    expect((await call()).status).toBe(200) // $0.15
    expect((await call()).status).toBe(200) // $0.30
    expect((await call()).status).toBe(200) // $0.45
    expect((await call()).status).toBe(402) // would reserve past $0.50
    expect((c.upstream as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3)
  })

  it('refuses a call whose worst case alone exceeds what is left', async () => {
    const c = config({ budgetUsd: 0.3 })
    const token = await startTrial(c)
    // 16,000 output tokens on Opus could cost $0.40 by themselves.
    const res = await handleTrial(
      post('/trial/v1/messages', { body: body(), key: token }),
      '1.1.1.1',
      c,
    )
    expect(res.status).toBe(402)
    expect((c.upstream as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
    // The refused reservation is returned: a smaller call still fits.
    const small = await handleTrial(
      post('/trial/v1/messages', { body: body({ max_tokens: 2_000 }), key: token }),
      '1.1.1.1',
      c,
    )
    expect(small.status).toBe(200)
  })

  it('lets only as many calls through at once as the budget covers', async () => {
    const c = config({ budgetUsd: 0.5 })
    const token = await startTrial(c)
    const many = await Promise.all(
      Array.from({ length: 10 }, () =>
        handleTrial(
          post('/trial/v1/messages', { body: body({ max_tokens: 4_000 }), key: token }),
          '1.1.1.1',
          c,
        ),
      ),
    )
    const passed = many.filter((r) => r.status === 200).length
    expect(passed).toBeGreaterThan(0)
    expect(passed).toBeLessThanOrEqual(5)
  })

  it('returns the reservation when Anthropic cannot be reached', async () => {
    const c = config({
      budgetUsd: 0.5,
      upstream: vi.fn(async () => {
        throw new Error('offline')
      }) as never,
    })
    const token = await startTrial(c)
    for (let i = 0; i < 10; i++) {
      const res = await handleTrial(
        post('/trial/v1/messages', { body: body({ max_tokens: 4_000 }), key: token }),
        '1.1.1.1',
        c,
      )
      expect(res.status).toBe(502)
    }
    expect(await c.store?.get('trial:trialid000000000001')).toBeCloseTo(0, 6)
  })

  it('passes on no header the browser chose but the API version', async () => {
    const c = config()
    const token = await startTrial(c)
    const req = new Request('https://rumbo.test/trial/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': token,
        'anthropic-beta': 'something-costly',
        'anthropic-version': '2023-06-01',
      },
      body: body({ max_tokens: 2_000 }),
    })
    await handleTrial(req, '1.1.1.1', c)
    const init = (c.upstream as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | RequestInit
      | undefined
    expect(Object.keys((init?.headers ?? {}) as Record<string, string>).sort()).toEqual([
      'anthropic-version',
      'content-type',
      'x-api-key',
    ])
  })

  it('prices a call generously: media by size, output in full', () => {
    expect(
      worstCaseUsd(body({ max_tokens: 1_000 }), 'claude-opus-5', 1_000),
    ).toBeGreaterThanOrEqual(0.025)
    const pdf = body({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: 'A'.repeat(400_000) },
            },
          ],
        },
      ],
    })
    // ~10 pages' worth of base64 reads as ~30,000 tokens, not 130,000 characters.
    const cost = worstCaseUsd(pdf, 'claude-opus-5', 0)
    expect(cost).toBeGreaterThan(0.1)
    expect(cost).toBeLessThan(0.3)
  })

  it('closes every trial when the month is spent', async () => {
    const c = config({ monthlyUsd: 0.3 })
    const a = await startTrial(c, '1.1.1.1')
    const small = () =>
      handleTrial(
        post('/trial/v1/messages', { body: body({ max_tokens: 2_000 }), key: a }),
        '1.1.1.1',
        c,
      )
    expect((await small()).status).toBe(200) // month $0.15
    expect((await small()).status).toBe(200) // month $0.30
    expect((await handleTrial(post('/trial/start'), '2.2.2.2', c)).status).toBe(503)
    expect((await small()).status).toBe(402)
  })

  it('limits how many trials one address starts in a day', async () => {
    const c = config()
    for (let i = 0; i < 3; i++) await startTrial(c)
    expect((await handleTrial(post('/trial/start'), '1.1.1.1', c)).status).toBe(429)
    expect((await handleTrial(post('/trial/start'), '9.9.9.9', c)).status).toBe(200)
  })

  it('refuses a pass it did not issue', async () => {
    const res = await handleTrial(
      post('/trial/v1/messages', { body: body(), key: 'sk-ant-x' }),
      '1.1.1.1',
      config(),
    )
    expect(res.status).toBe(401)
  })

  it('forwards only the call shape the app sends', () => {
    expect(checkBody(body())).toBeNull()
    expect(checkBody(body({ model: 'claude-sonnet-5-5' }))).toBeNull()
    expect(checkBody(body({ model: 'claude-mythos-1' }))).toMatch(/Model/)
    expect(checkBody(body({ max_tokens: 64_000 }))).toMatch(/max_tokens/)
    expect(checkBody(body({ max_tokens: -100_000_000 }))).toMatch(/max_tokens/)
    expect(checkBody(body({ max_tokens: 0 }))).toMatch(/max_tokens/)
    expect(checkBody(body({ max_tokens: 1000.5 }))).toMatch(/max_tokens/)
    expect(checkBody(body({ tools: [] }))).toMatch(/tools/)
    expect(checkBody(body({ stream: true }))).toMatch(/stream/)
    expect(checkBody(body({ messages: [1, 2, 3] }))).toMatch(/messages/)
    expect(checkBody('nope')).toMatch(/JSON/)
  })

  it('never lowers a counter, whatever the request says', async () => {
    const c = config({ budgetUsd: 0.5 })
    const token = await startTrial(c)
    await handleTrial(
      post('/trial/v1/messages', { body: body({ max_tokens: 4_000 }), key: token }),
      '1.1.1.1',
      c,
    )
    const before = await c.store?.get('trial:trialid000000000001')
    const res = await handleTrial(
      post('/trial/v1/messages', { body: body({ max_tokens: -100_000_000 }), key: token }),
      '1.1.1.1',
      c,
    )
    expect(res.status).toBe(400)
    expect(await c.store?.get('trial:trialid000000000001')).toBe(before)
  })

  it('tells a pass what it has left, and nothing to anyone else', async () => {
    const c = config({ budgetUsd: 0.5 })
    const token = await startTrial(c)
    await handleTrial(
      post('/trial/v1/messages', { body: body({ max_tokens: 4_000 }), key: token }),
      '1.1.1.1',
      c,
    )
    const res = await handleTrial(post('/api/trial?op=status', { key: token }), '1.1.1.1', c)
    expect(await res.json()).toEqual({
      state: 'ok',
      leftUsd: expect.closeTo(0.35, 6),
      budgetUsd: 0.5,
    })
    expect(
      (await handleTrial(post('/api/trial?op=status', { key: 'nope' }), '1.1.1.1', c)).status,
    ).toBe(401)
  })
})
