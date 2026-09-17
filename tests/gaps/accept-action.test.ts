import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EvidenceItem } from '@/lib/schemas'

const upsertEvidenceMock = vi.fn()
const getApplicationMock = vi.fn()

vi.mock('@/lib/db/client', () => ({
  db: { transaction: (fn: (tx: unknown) => void) => fn({}) },
}))
vi.mock('@/lib/db/queries/evidence', () => ({
  upsertEvidence: upsertEvidenceMock,
  listEvidence: () => [],
}))
vi.mock('@/lib/db/queries/applications', () => ({ getApplication: getApplicationMock }))
vi.mock('@/lib/demo/mode', () => ({
  isDemo: () => false,
  demoBlock: () => ({ ok: false as const, error: 'demo', code: 'demo-read-only' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { acceptGapEvidenceAction } = await import('@/app/(app)/application/[id]/gaps/actions')

const item = (over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id: 'ev_gap_1',
  kind: 'achievement',
  sourceRef: { type: 'experience', id: 'exp_1' },
  text: 'Configured Salesforce approval workflows.',
  metrics: [],
  tags: ['salesforce'],
  period: { start: '2023-01', end: '2023-11' },
  strength: 'core',
  origin: 'gap-fill',
  ...over,
})

describe('acceptGapEvidenceAction', () => {
  beforeEach(() => {
    upsertEvidenceMock.mockReset()
    getApplicationMock.mockReset()
    getApplicationMock.mockReturnValue({
      coverage: { verdict: 'stretch' },
      mappings: [{ requirementId: 'req_1', evidenceIds: [], strength: 'none', rationale: '' }],
    })
  })

  it('saves the evidence and returns the pre-remap snapshot', async () => {
    const result = await acceptGapEvidenceAction({ applicationId: 'app_1', evidence: [item()] })

    expect(result.ok).toBe(true)
    expect(upsertEvidenceMock).toHaveBeenCalledTimes(1)
    if (result.ok) {
      expect(result.before).toEqual({ verdict: 'stretch', strengths: { req_1: 'none' } })
    }
  })

  it('forces the gap-fill origin even if the client claims another one', async () => {
    await acceptGapEvidenceAction({
      applicationId: 'app_1',
      evidence: [item({ origin: 'interview' })],
    })
    expect(upsertEvidenceMock.mock.calls[0][1].origin).toBe('gap-fill')
  })

  it('returns an error instead of throwing when the evidence does not validate', async () => {
    const result = await acceptGapEvidenceAction({
      applicationId: 'app_1',
      evidence: [{ ...item(), text: '' }],
    })
    expect(result.ok).toBe(false)
    expect(upsertEvidenceMock).not.toHaveBeenCalled()
  })

  it('refuses when the application does not exist', async () => {
    getApplicationMock.mockReturnValue(null)
    const result = await acceptGapEvidenceAction({ applicationId: 'nope', evidence: [item()] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not-found')
  })
})
