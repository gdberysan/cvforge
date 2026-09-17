import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'
import { MasterProfileSchema } from '@/lib/schemas'

const planInterviewMock = vi.fn()
const structureAnswersMock = vi.fn()

vi.mock('@/lib/ai/stages/interview', () => ({
  planInterview: planInterviewMock,
  structureAnswers: structureAnswersMock,
}))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/profile', () => ({ getProfile: () => profile }))
vi.mock('@/lib/db/queries/evidence', () => ({ listEvidence: () => evidence }))
vi.mock('@/lib/demo/mode', () => ({ isDemo: () => false }))
vi.mock('@/lib/i18n/server', () => ({ getLocale: async () => 'es' }))

const profile: MasterProfile = MasterProfileSchema.parse({
  basics: { fullName: 'Test' },
  experience: [{ id: 'exp_1', title: 'Founder', company: 'Alpha', period: { start: '2019-01' } }],
  preferences: {},
  updatedAt: '2026-09-01T00:00:00.000Z',
})

const item = (id: string, origin: EvidenceItem['origin'], text: string): EvidenceItem => ({
  id,
  kind: 'achievement',
  sourceRef: { type: 'experience', id: 'exp_1' },
  text,
  metrics: [],
  tags: [],
  period: { start: '2019-01' },
  strength: 'core',
  origin,
})

let evidence: EvidenceItem[] = []

const { POST } = await import('@/app/api/ai/interview/route')

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/ai/interview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  planInterviewMock.mockReset().mockResolvedValue([])
  structureAnswersMock.mockReset().mockResolvedValue({ evidence: [], dropped: [] })
  evidence = [
    item('ev_stub', 'import', 'A compressed CV line.'),
    item('ev_done', 'interview', 'Ran the Google My Business listing for the shop.'),
  ]
})

describe('POST /api/ai/interview', () => {
  it('tells the structuring stage what this role already has', async () => {
    // Without this the route computes `existing` for planInterview and then
    // throws it away, so re-interviewing a role records work already on file a
    // second time and the CV composer is left guessing which copy to believe.
    await post({
      action: 'structure',
      roleId: 'exp_1',
      answers: [{ questionId: 'q1', question: 'How did it start?', answer: 'With inventory.' }],
    })

    const passed = structureAnswersMock.mock.calls[0][0]
    expect(passed.existing.map((e: EvidenceItem) => e.id)).toEqual(['ev_done'])
    // Stubs stay separate: they are scaffolding this run consumes, not records
    // to protect from duplication.
    expect(passed.stubs.map((e: EvidenceItem) => e.id)).toEqual(['ev_stub'])
  })

  it('still hands the planner the same records, unchanged', async () => {
    await post({ action: 'plan', roleId: 'exp_1' })

    const passed = planInterviewMock.mock.calls[0][0]
    expect(passed.existing.map((e: EvidenceItem) => e.id)).toEqual(['ev_done'])
  })
})
