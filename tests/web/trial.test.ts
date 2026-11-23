import { describe, expect, it, vi } from 'vitest'
import { checkBody, handleTrial, reserveUsd, type TrialConfig } from '@/web/trial/proxy'
import { memoryStore } from '@/web/trial/store'
import { issueToken, readToken } from '@/web/trial/token'

const SECRET = 'test-secret-not-real'
const NOW = Date.UTC(2026, 10, 23, 12)

type Mock = ReturnType<typeof vi.fn>

const sse = (events: object[]) =>
  events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('')

function streamed(usage: { input_tokens: number; output_tokens: number }) {
  return sse([
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: usage.input_tokens, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{}' } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: usage.output_tokens },
    },
    { type: 'message_stop' },
  ])
}

/**
 * Anthropic as the trial meets it: the free token count, then the streamed
 * call. `counted` is what the count says the input is; `usage` what the call
 * is billed; `answer` replaces the streamed answer (an error, a cut stream).
 */
function anthropic(
  opts: {
    counted?: number
    usage?: { input_tokens: number; output_tokens: number }
    answer?: () => Response
  } = {},
) {
  const usage = opts.usage ?? { input_tokens: 10_000, output_tokens: 4_000 }
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('/count_tokens')) {
      return Response.json({ input_tokens: opts.counted ?? usage.input_tokens })
    }
    if (opts.answer) return opts.answer()
    return new Response(streamed(usage), { headers: { 'content-type': 'text/event-stream' } })
  })
}

/** The billed calls only, not the free counts. */
const billed = (c: TrialConfig) =>
  (c.upstream as unknown as Mock).mock.calls.filter(([u]) => !String(u).includes('/count_tokens'))

const errorType = async (res: Response) =>
  ((await res.json()) as { error?: { type?: string } }).error?.type

function config(over: Partial<TrialConfig> = {}): TrialConfig {
  let n = 0
  return {
    secret: SECRET,
    anthropicKey: 'upstream-key-placeholder',
    store: memoryStore(),
    open: true,
    budgetUsd: 1.25,
    monthlyUsd: 90,
    dailyUsd: 90,
    startsPerAddressPerDay: 3,
    callsPerAddressPerHour: 60,
    now: () => NOW,
    upstream: anthropic() as never,
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
    // One ordinary message back, assembled from the stream.
    expect(((await res.clone().json()) as { content: unknown[] }).content).toEqual([
      { type: 'text', text: '{}' },
    ])
    const [url, init] = billed(c)[0] ?? []
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages')
    expect(new Headers((init as RequestInit).headers).get('x-api-key')).toBe(
      'upstream-key-placeholder',
    )
    expect(JSON.parse(String((init as RequestInit).body)).stream).toBe(true)
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
    const last = await call() // would reserve past $0.50, with too little left for any step
    expect(last.status).toBe(402)
    expect(await errorType(last)).toBe('trial_ended')
    expect(billed(c)).toHaveLength(3)
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
    // Only this step does not fit: the trial itself goes on.
    expect(await errorType(res)).toBe('trial_unavailable')
    expect(billed(c)).toHaveLength(0)
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
    // $0.15 reserved each against $0.50.
    expect(passed).toBeLessThanOrEqual(3)
  })

  it('reserves nothing when Anthropic cannot be reached', async () => {
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

  it('passes on nothing the browser chose but the body', async () => {
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
    expect((await handleTrial(req, '1.1.1.1', c)).status).toBe(200)
    for (const [, init] of (c.upstream as unknown as Mock).mock.calls) {
      const sent = new Headers((init as RequestInit).headers)
      expect(sent.get('anthropic-beta')).toBeNull()
      expect(sent.get('x-api-key')).toBe('upstream-key-placeholder')
    }
  })

  it('keeps the reservation when a call is lost after it began, and returns it when refused', async () => {
    const cut = () =>
      new Response(
        (() => {
          // The answer begins, then the connection drops on the next read.
          let reads = 0
          return new ReadableStream({
            pull(controller) {
              if (reads++ === 0) {
                controller.enqueue(
                  new TextEncoder().encode(
                    streamed({ input_tokens: 10_000, output_tokens: 4_000 }).split(
                      'event: content_block_start',
                    )[0],
                  ),
                )
              } else {
                controller.error(new Error('connection reset'))
              }
            },
          })
        })(),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    const lost = config({ upstream: anthropic({ answer: cut }) as never })
    const a = await startTrial(lost)
    const res = await handleTrial(
      post('/trial/v1/messages', { body: body({ max_tokens: 4_000 }), key: a }),
      '1.1.1.1',
      lost,
    )
    expect(res.status).toBe(502)
    // Anthropic may have billed it: the worst case stays charged.
    expect(await lost.store?.get('trial:trialid000000000001')).toBeCloseTo(0.15, 6)

    const busy = () =>
      Response.json(
        { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
        { status: 529 },
      )
    const refused = config({ upstream: anthropic({ answer: busy }) as never })
    const b = await startTrial(refused)
    const res2 = await handleTrial(
      post('/trial/v1/messages', { body: body({ max_tokens: 4_000 }), key: b }),
      '1.1.1.1',
      refused,
    )
    // Passed on as it came, so the app backs off as usual; nothing billed.
    expect(res2.status).toBe(529)
    expect(await errorType(res2)).toBe('overloaded_error')
    expect(await refused.store?.get('trial:trialid000000000001')).toBeCloseTo(0, 6)
  })

  it('prices a PDF by what Anthropic counts, not by its size on the wire', async () => {
    // A small file of many near-blank pages: tiny in base64, 300,000 tokens counted.
    const c = config({ upstream: anthropic({ counted: 300_000 }) as never })
    const token = await startTrial(c)
    const pdf = body({
      max_tokens: 1,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0x' },
            },
          ],
        },
      ],
    })
    const res = await handleTrial(
      post('/trial/v1/messages', { body: pdf, key: token }),
      '1.1.1.1',
      c,
    )
    expect(res.status).toBe(402)
    expect(billed(c)).toHaveLength(0)
  })

  it('reserves the counted input and every output token, cache writes at their rate', () => {
    // Opus: $5/M in, $25/M out, $6.25/M to write the cache.
    expect(reserveUsd(10_000, false, 'claude-opus-5', 1_000)).toBeCloseTo(0.075, 6)
    expect(reserveUsd(10_000, true, 'claude-opus-5', 1_000)).toBeCloseTo(0.0875, 6)
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
    const full = await small()
    expect(full.status).toBe(402)
    // Full for now is not this person's trial ending.
    expect(await errorType(full)).toBe('trial_unavailable')
  })

  it('closes every trial for the rest of the day when the day is spent', async () => {
    const c = config({ dailyUsd: 0.3 })
    const a = await startTrial(c, '1.1.1.1')
    const small = () =>
      handleTrial(
        post('/trial/v1/messages', { body: body({ max_tokens: 2_000 }), key: a }),
        '1.1.1.1',
        c,
      )
    expect((await small()).status).toBe(200)
    expect((await small()).status).toBe(200)
    expect((await small()).status).toBe(402)
    expect((await handleTrial(post('/trial/start'), '2.2.2.2', c)).status).toBe(503)
    // The next day opens again.
    const tomorrow = { ...c, now: () => NOW + 86_400_000 }
    expect((await handleTrial(post('/trial/start'), '2.2.2.2', tomorrow)).status).toBe(200)
  })

  it('says an expired pass is a trial that ended, not a missing key', async () => {
    const c = config()
    const old = await issueToken(SECRET, 'abcdefghijklmnop', NOW - 1)
    const res = await handleTrial(
      post('/trial/v1/messages', { body: body(), key: old }),
      '1.1.1.1',
      c,
    )
    expect(res.status).toBe(402)
    expect(await errorType(res)).toBe('trial_ended')
    expect(
      (await handleTrial(post('/api/trial?op=status', { key: old }), '1.1.1.1', c)).status,
    ).toBe(410)
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
    expect(checkBody(body({ metadata: {} }))).toMatch(/metadata/)
    const turn = (content: unknown) => body({ messages: [{ role: 'user', content }] })
    const doc = (source: unknown) => turn([{ type: 'document', source }])
    // What the app sends: text, a PDF or an image carried in the call, a 5-minute cache.
    expect(
      checkBody(doc({ type: 'base64', media_type: 'application/pdf', data: 'JVBE' })),
    ).toBeNull()
    expect(
      checkBody(
        turn([
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBO' } },
        ]),
      ),
    ).toBeNull()
    expect(
      checkBody(
        body({ system: [{ type: 'text', text: 's', cache_control: { type: 'ephemeral' } }] }),
      ),
    ).toBeNull()
    // Never anything the trial's key would fetch or keep longer, uncounted.
    expect(checkBody(doc({ type: 'url', url: 'https://example.com/a.pdf' }))).toMatch(/Source/)
    expect(checkBody(doc({ type: 'file', file_id: 'file_1' }))).toMatch(/Source/)
    expect(checkBody(doc({ type: 'base64', media_type: 'text/plain', data: 'aGk=' }))).toMatch(
      /Source/,
    )
    expect(
      checkBody(
        body({
          system: [{ type: 'text', text: 's', cache_control: { type: 'ephemeral', ttl: '1h' } }],
        }),
      ),
    ).toMatch(/cache_control/)
    expect(checkBody(turn([{ type: 'search_result', content: [] }]))).toMatch(/not allowed/)
    expect(
      checkBody(
        body({
          messages: [
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
          ],
        }),
      ),
    ).toMatch(/messages/)
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

  it('counts a network, not an address, and never stores the address itself', async () => {
    const { networkOf, networkCode } = await import('@/web/trial/network')
    expect(networkOf('2001:db8:abcd:12:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:abcd:12::/64')
    expect(networkOf('2001:db8:abcd:12::1')).toBe('2001:db8:abcd:12::/64')
    expect(networkOf('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(networkOf('::ffff:203.0.113.9')).toBe('203.0.113.9')
    expect(networkOf('203.0.113.9')).toBe('203.0.113.9')
    // One /64 is one network: rotating its low bits does not reset the limit.
    const c = config()
    for (let i = 1; i <= 3; i++) {
      expect((await handleTrial(post('/trial/start'), `2001:db8:1:2::${i}`, c)).status).toBe(200)
    }
    expect((await handleTrial(post('/trial/start'), '2001:db8:1:2::ffff', c)).status).toBe(429)
    // The code is stable, keyed and short; the address is in no key.
    const code = await networkCode('k', '203.0.113.9')
    expect(code).toBe(await networkCode('k', '203.0.113.9'))
    expect(code).not.toBe(await networkCode('other', '203.0.113.9'))
    expect(code).not.toContain('203')
  })
})
