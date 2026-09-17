import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type EvidenceItem, MasterProfileSchema } from '@/lib/schemas'

const structureAnswersMock = vi.fn()
vi.mock('@/lib/ai/stages/interview', () => ({ structureAnswers: structureAnswersMock }))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/profile', () => ({ getProfile: () => profile }))
vi.mock('@/lib/db/queries/evidence', () => ({ listEvidence: () => evidence }))
vi.mock('@/lib/demo/mode', () => ({ isDemo: () => false }))

// Parsed, not cast: the defaults are the schema's own, so this fixture cannot
// drift away from a real profile without failing here first.
const profile = MasterProfileSchema.parse({
  basics: { fullName: 'Test Person' },
  experience: [
    {
      id: 'exp_1',
      title: 'Analyst',
      company: 'Alpha',
      period: { start: '2020-01', end: '2022-01' },
    },
    { id: 'exp_2', title: 'Lead', company: 'Beta', period: { start: '2022-02' } },
  ],
  preferences: {},
  updatedAt: '2026-08-30T00:00:00.000Z',
})

const drafted = (id: string, roleId = 'exp_1'): EvidenceItem => ({
  id,
  kind: 'achievement',
  sourceRef: { type: 'experience', id: roleId },
  text: 'Something real.',
  metrics: [],
  tags: [],
  period: { start: '2020-01' },
  strength: 'core',
  origin: 'interview',
})

let evidence: EvidenceItem[] = []

const { POST } = await import('@/app/api/ai/gaps/route')

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/ai/gaps', { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/ai/gaps', () => {
  beforeEach(() => {
    evidence = []
    structureAnswersMock.mockReset()
    structureAnswersMock.mockResolvedValue({ evidence: [drafted('ev_a')], dropped: [] })
  })

  it('makes one model call per employer, not one per gap', async () => {
    await post({
      applicationId: 'app_1',
      entries: [
        { requirementId: 'req_1', roleId: 'exp_1', question: 'q', answer: 'a' },
        { requirementId: 'req_2', roleId: 'exp_1', question: 'q', answer: 'a' },
        { requirementId: 'req_3', roleId: 'exp_2', question: 'q', answer: 'a' },
      ],
    })

    expect(structureAnswersMock).toHaveBeenCalledTimes(2)
    expect(structureAnswersMock.mock.calls[0][0].role.id).toBe('exp_1')
    expect(structureAnswersMock.mock.calls[0][0].answers).toHaveLength(2)
    expect(structureAnswersMock.mock.calls[1][0].role.id).toBe('exp_2')
  })

  it('hands each role only its own existing records, so dedupe context is not crossed', async () => {
    evidence = [
      { ...drafted('ev_alpha', 'exp_1'), text: 'Alpha work.' },
      { ...drafted('ev_beta', 'exp_2'), text: 'Beta work.' },
    ]

    await post({
      applicationId: 'app_1',
      entries: [
        { requirementId: 'req_1', roleId: 'exp_1', question: 'q', answer: 'a' },
        { requirementId: 'req_2', roleId: 'exp_2', question: 'q', answer: 'a' },
      ],
    })

    expect(structureAnswersMock.mock.calls[0][0].existing.map((e: EvidenceItem) => e.id)).toEqual([
      'ev_alpha',
    ])
    expect(structureAnswersMock.mock.calls[1][0].existing.map((e: EvidenceItem) => e.id)).toEqual([
      'ev_beta',
    ])
  })

  it('stamps every drafted record as gap-fill, whatever the stage returned', async () => {
    const res = await post({
      applicationId: 'app_1',
      entries: [{ requirementId: 'req_1', roleId: 'exp_1', question: 'q', answer: 'a' }],
    })
    const data = await res.json()
    expect(data.evidence).toHaveLength(1)
    expect(data.evidence[0].origin).toBe('gap-fill')
  })

  it('rejects a body with no answered gaps rather than paying for an empty call', async () => {
    const res = await post({ applicationId: 'app_1', entries: [] })
    expect(res.status).toBe(400)
    expect(structureAnswersMock).not.toHaveBeenCalled()
  })

  it('rejects an entry naming a role that is not in the profile', async () => {
    const res = await post({
      applicationId: 'app_1',
      entries: [{ requirementId: 'req_1', roleId: 'exp_nope', question: 'q', answer: 'a' }],
    })
    expect(res.status).toBe(404)
    expect(structureAnswersMock).not.toHaveBeenCalled()
  })
})
