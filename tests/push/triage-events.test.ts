import { beforeEach, describe, expect, it, vi } from 'vitest'

const notify = vi.fn(() => Promise.resolve('sent'))
let release: () => void = () => {}
const runTriage = vi.fn(
  () =>
    new Promise((resolve) => {
      release = () =>
        resolve({
          company: 'Acme',
          jobTitle: 'Growth Lead',
          language: 'en',
          requirements: [],
          mappings: [],
          coverage: { verdict: 'worth-it' },
        })
    }),
)
vi.mock('@/lib/push/notify', () => ({ notify }))
vi.mock('@/lib/ai/triage', () => ({ runTriage, runRemap: vi.fn() }))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/profile', () => ({ getProfile: () => ({}) }))
vi.mock('@/lib/db/queries/evidence', () => ({ listEvidence: () => [] }))
vi.mock('@/lib/ai/projection', () => ({ buildEvidenceProjection: () => ({}) }))
vi.mock('@/lib/hash', () => ({ hashEvidenceProjection: () => 'e', hashPosting: () => 'p' }))
vi.mock('@/lib/i18n/server', () => ({ getLocale: async () => 'en' }))
vi.mock('@/lib/db/queries/applications', () => ({
  createApplication: () => 'app_1',
  findByPostingHash: () => null,
  updateAnalysis: vi.fn(),
  updateIntake: vi.fn(),
}))

const { POST } = await import('@/app/api/ai/triage/route')

const request = () =>
  new Request('http://localhost:3000/api/ai/triage', {
    method: 'POST',
    body: JSON.stringify({ text: 'x'.repeat(120), market: 'mx' }),
  })
const settle = () => new Promise((r) => setTimeout(r, 20))

describe('triage finishes while you are away', () => {
  beforeEach(() => {
    notify.mockClear()
  })

  it('notifies the phone when the screen that started it is gone', async () => {
    const res = await POST(request())
    await settle()
    await res.body?.cancel()
    release()
    await settle()
    expect(notify).toHaveBeenCalledWith(
      {},
      {
        kind: 'verdict-ready',
        title: 'Worth it',
        body: 'Growth Lead · Acme',
        url: '/application/app_1',
      },
    )
  })

  it('notifies even while the stream is open — Android keeps a backgrounded tab connected; the phone decides whether to show it', async () => {
    const res = await POST(request())
    const reading = new Response(res.body).text()
    await settle()
    release()
    await reading
    await settle()
    expect(notify).toHaveBeenCalledOnce()
  })
})
