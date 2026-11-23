import { describe, expect, it, vi } from 'vitest'
import { boardCandidates, parseBoardUrl, probeBoard } from '@/lib/satellite/board-probe'

describe('parseBoardUrl', () => {
  it.each([
    ['https://boards.greenhouse.io/acme', 'greenhouse'],
    ['https://job-boards.greenhouse.io/acme/jobs/123?gh_src=x', 'greenhouse'],
    ['https://jobs.lever.co/acme/abc-def', 'lever'],
    ['https://jobs.ashbyhq.com/acme?utm=1', 'ashby'],
    ['https://apply.workable.com/acme/', 'workable'],
  ])('%s', (url, site) => {
    expect(parseBoardUrl(url)).toEqual({ site, board: 'acme' })
  })
  it('is null for a malformed escape instead of throwing', () => {
    expect(parseBoardUrl('https://jobs.lever.co/%E0%A4')).toBeNull()
  })
  it('is null for anything else', () => {
    expect(parseBoardUrl('https://acme.com/careers')).toBeNull()
    expect(parseBoardUrl('Hugging Face')).toBeNull()
    expect(parseBoardUrl('https://jobs.lever.co/')).toBeNull()
  })
})

describe('boardCandidates', () => {
  it('joins and hyphenates, deduped', () => {
    expect(boardCandidates('Hugging Face')).toEqual(['huggingface', 'hugging-face'])
    expect(boardCandidates('Stripe')).toEqual(['stripe'])
  })
  it('folds accents and drops punctuation', () => {
    expect(boardCandidates('Mercado Nórte!')).toEqual(['mercadonorte', 'mercado-norte'])
  })
})

const json = (body: unknown, status = 200) =>
  ({ status, ok: status === 200, json: async () => body }) as Response

describe('probeBoard', () => {
  it('tries greenhouse, lever, ashby, workable, candidates in order, at most 8 calls', async () => {
    const f = vi.fn(async () => json({}, 404))
    expect(await probeBoard('Hugging Face', f as never)).toBeNull()
    const urls = f.mock.calls.map((c) => (c as unknown as [string])[0])
    expect(urls).toHaveLength(8)
    expect(urls[0]).toContain('greenhouse.io/v1/boards/huggingface/')
    expect(urls[1]).toContain('greenhouse.io/v1/boards/hugging-face/')
    expect(urls[2]).toContain('api.lever.co/v0/postings/huggingface')
    expect(urls[4]).toContain('ashbyhq.com')
    expect(urls[6]).toContain('workable.com')
  })
  it('picks the first 200 with a posting and skips an empty 200', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes('greenhouse') ? json({ jobs: [] }) : json([{ id: 'x' }]),
    )
    expect(await probeBoard('Acme', f as never)).toEqual({ site: 'lever', board: 'acme' })
    expect(f).toHaveBeenCalledTimes(4) // one candidate x four sites, all at once
  })
  it('sends every request with a 10 s timeout signal, all at once', async () => {
    const signals: unknown[] = []
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      signals.push(init?.signal)
      return json({}, 404)
    })
    const p = probeBoard('Hugging Face', f as never)
    expect(f).toHaveBeenCalledTimes(8) // issued synchronously, before any answer
    await p
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true)
  })
  it('lets the spec order decide when a later site answers first', async () => {
    const f = vi.fn(async (url: string) => {
      if (url.includes('workable')) return json({ jobs: [{}] })
      if (url.includes('greenhouse')) {
        await new Promise((r) => setTimeout(r, 20))
        return json({ jobs: [{}] })
      }
      return json({}, 404)
    })
    expect(await probeBoard('Acme', f as never)).toEqual({ site: 'greenhouse', board: 'acme' })
  })
  it('treats a thrown fetch as not here', async () => {
    const f = vi.fn(async (url: string) => {
      if (url.includes('greenhouse')) throw new Error('boom')
      return json({ jobs: [{ id: 1 }] })
    })
    expect(await probeBoard('Acme', f as never)).toEqual({ site: 'ashby', board: 'acme' })
  })
})
