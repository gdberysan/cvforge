import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructuredMock = vi.fn()
const composeCvMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))
vi.mock('@/lib/ai/stages/compose-cv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/stages/compose-cv')>(
    '@/lib/ai/stages/compose-cv',
  )
  return { ...actual, composeCv: composeCvMock }
})

const { checkDistortions } = await import('@/lib/ai/stages/verify-distortion')
const { composeAndVerify, recheckCv } = await import('@/lib/ai/compose')

import type { CVContent, EvidenceItem, MasterProfile } from '@/lib/schemas'

const profile: MasterProfile = {
  basics: {
    fullName: 'G',
    headline: '',
    email: 'g@b.com',
    location: 'CDMX',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  experience: [
    {
      id: 'exp_1',
      title: 'Engineer',
      company: 'Tiendamax',
      period: { start: '2016-01' },
      summary: '',
    },
  ],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

const evidence: EvidenceItem[] = [
  {
    id: 'ev_1',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Helped the team migrate checkout',
    metrics: [],
    tags: [],
    period: { start: '2016-01' },
    strength: 'core',
    origin: 'manual',
  },
]

function cvWith(text: string): CVContent {
  return {
    header: { fullName: 'G', title: 'E', contactLines: [] },
    summary: '',
    summaryCitedEvidenceIds: [],
    experience: [
      {
        experienceId: 'exp_1',
        title: 'Engineer',
        company: 'Tiendamax',
        startDate: '2016-01',
        bullets: [{ id: 'b1', text, citedEvidenceIds: ['ev_1'], keywordsUsed: [] }],
      },
    ],
    projects: [],
    education: [],
    skills: [],
    extras: [],
  }
}

const baseArgs = {
  profile,
  requirements: [],
  mappings: [
    { requirementId: 'r1', evidenceIds: ['ev_1'], strength: 'strong' as const, rationale: '' },
  ],
  evidence,
  language: 'en' as const,
  market: 'us-remote' as const,
  company: 'Acme',
  jobTitle: 'Engineer',
  postingVocabulary: new Set<string>(),
}

describe('checkDistortions', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('runs at low effort and batches every bullet into one call', async () => {
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })
    await checkDistortions([
      { id: 'b1', text: 'x', sources: ['s'] },
      { id: 'b2', text: 'y', sources: ['s'] },
    ])
    expect(callStructuredMock).toHaveBeenCalledTimes(1)
    expect(callStructuredMock.mock.calls[0][0].effort).toBe('low')
  })

  it("asks for reasons in the reader's language, Spanish when unsaid", async () => {
    callStructuredMock.mockResolvedValue({ verdicts: [] })
    const bullet = [{ id: 'b1', text: 'x', sources: ['y'] }]
    await checkDistortions(bullet)
    await checkDistortions(bullet, 'en')
    expect(callStructuredMock.mock.calls[0][0].user).toContain('Mexican Spanish')
    expect(callStructuredMock.mock.calls[1][0].user).toContain('in English')
  })

  it('returns an empty array without calling the model when there are no bullets', async () => {
    expect(await checkDistortions([])).toEqual([])
    expect(callStructuredMock).not.toHaveBeenCalled()
  })
})

describe('composeAndVerify', () => {
  beforeEach(() => {
    callStructuredMock.mockReset()
    composeCvMock.mockReset()
  })

  it('returns a passing report without a repair pass when everything checks out', async () => {
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    const { report } = await composeAndVerify(baseArgs)
    expect(report.passed).toBe(true)
    expect(composeCvMock).toHaveBeenCalledTimes(1)
  })

  it('reports its real stages in order — "repairing" only when a repair ran', async () => {
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    const clean: string[] = []
    await composeAndVerify({ ...baseArgs, onProgress: (s) => clean.push(s) })
    expect(clean).toEqual(['writing', 'checking', 'verifying'])

    composeCvMock
      .mockResolvedValueOnce(cvWith('Cut abandonment 40%'))
      .mockResolvedValueOnce(cvWith('Migrated the checkout flow'))
    const repaired: string[] = []
    await composeAndVerify({ ...baseArgs, onProgress: (s) => repaired.push(s) })
    expect(repaired).toEqual(['writing', 'checking', 'repairing', 'verifying'])
  })

  it('regenerates once when the deterministic checks fail, naming the problem', async () => {
    composeCvMock
      .mockResolvedValueOnce(cvWith('Cut abandonment 40%'))
      .mockResolvedValueOnce(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    const { report } = await composeAndVerify(baseArgs)

    expect(composeCvMock).toHaveBeenCalledTimes(2)
    expect(composeCvMock.mock.calls[1][0].repairInstruction).toContain('40%')
    expect(report.passed).toBe(true)
  })

  it('gives up after exactly one repair and reports the remaining problems', async () => {
    composeCvMock.mockResolvedValue(cvWith('Cut abandonment 40%'))
    callStructuredMock.mockResolvedValue({ verdicts: [] })

    const { report } = await composeAndVerify(baseArgs)

    expect(composeCvMock).toHaveBeenCalledTimes(2)
    expect(report.passed).toBe(false)
    expect(report.unverifiedNumbers).toHaveLength(1)
  })

  it('annotates every source with its period so tense is checkable', async () => {
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    await composeAndVerify(baseArgs)
    // The evidence has an open period; the source line carries it.
    expect(JSON.stringify(callStructuredMock.mock.calls[0])).toContain('[2016-01–present]')
  })

  it('records a distortion verdict on the report', async () => {
    composeCvMock.mockResolvedValue(cvWith('Single-handedly rebuilt checkout'))
    callStructuredMock.mockResolvedValue({
      verdicts: [
        {
          bulletId: 'b1',
          supported: false,
          reason: 'Source says "helped the team", not single-handedly.',
        },
      ],
    })

    const { report } = await composeAndVerify(baseArgs)
    expect(report.distortions[0].reason).toContain('helped the team')
    expect(report.passed).toBe(false)
  })

  it('rewrites the flagged lines once and keeps the rewrite when it is cleaner', async () => {
    const flagged = {
      verdicts: [{ bulletId: 'b1', supported: false, reason: 'Source says "helped the team".' }],
    }
    composeCvMock
      .mockResolvedValueOnce(cvWith('Single-handedly rebuilt checkout'))
      .mockResolvedValueOnce(cvWith('Helped the team migrate checkout'))
    callStructuredMock
      .mockResolvedValueOnce(flagged)
      .mockResolvedValueOnce({ verdicts: [{ bulletId: 'b1', supported: true, reason: '' }] })

    const stages: string[] = []
    const { cv, report } = await composeAndVerify({
      ...baseArgs,
      onProgress: (s) => stages.push(s),
    })
    expect(composeCvMock).toHaveBeenCalledTimes(2)
    const instruction = composeCvMock.mock.calls[1][0].repairInstruction as string
    expect(instruction).toContain('Single-handedly rebuilt checkout')
    expect(instruction).toContain('helped the team')
    expect(instruction).toContain('<previous-draft>')
    expect(cv.experience[0].bullets[0].text).toBe('Helped the team migrate checkout')
    expect(report.distortions).toEqual([])
    expect(report.passed).toBe(true)
    expect(stages).toEqual(['writing', 'checking', 'verifying', 'refining', 'rechecking'])
  })

  it('keeps the first draft when the rewrite is no cleaner', async () => {
    composeCvMock
      .mockResolvedValueOnce(cvWith('Single-handedly rebuilt checkout'))
      .mockResolvedValueOnce(cvWith('Alone rebuilt checkout'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: false, reason: 'Not alone.' }],
    })
    const { cv, report } = await composeAndVerify(baseArgs)
    expect(cv.experience[0].bullets[0].text).toBe('Single-handedly rebuilt checkout')
    expect(report.distortions).toHaveLength(1)
    expect(report.passed).toBe(false)
  })

  it('keeps the first draft, unchecked again, when the rewrite breaks the code checks', async () => {
    composeCvMock
      .mockResolvedValueOnce(cvWith('Single-handedly rebuilt checkout'))
      .mockResolvedValueOnce(cvWith('Cut abandonment 40%'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: false, reason: 'Not alone.' }],
    })
    const { cv } = await composeAndVerify(baseArgs)
    expect(cv.experience[0].bullets[0].text).toBe('Single-handedly rebuilt checkout')
    // One distortion call: the broken rewrite never reached the model.
    expect(callStructuredMock).toHaveBeenCalledTimes(1)
  })

  it('asks once more about a line the batched check skipped', async () => {
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock
      .mockResolvedValueOnce({ verdicts: [] })
      .mockResolvedValueOnce({ verdicts: [{ bulletId: 'b1', supported: true, reason: '' }] })
    const { report } = await composeAndVerify(baseArgs)
    expect(callStructuredMock).toHaveBeenCalledTimes(2)
    expect(callStructuredMock.mock.calls[1][0].user).toContain('<bullet id="b1">')
    expect(report.distortions).toEqual([])
  })

  it('re-checks a saved CV whose summary predates citations against what it could draw on', async () => {
    callStructuredMock.mockResolvedValue({
      verdicts: [
        { bulletId: 'summary', supported: true, reason: '' },
        { bulletId: 'b1', supported: true, reason: '' },
      ],
    })
    const saved = {
      ...cvWith('Migrated the checkout flow'),
      summary: 'Engineer who migrates checkouts.',
    }
    delete (saved as { summaryCitedEvidenceIds?: string[] }).summaryCitedEvidenceIds
    const report = await recheckCv(saved, { ...baseArgs, legacySummary: true })
    expect(report.uncitedBullets).toEqual([])
    expect(callStructuredMock.mock.calls[0][0].user).toContain('<bullet id="summary">')
    expect(report.passed).toBe(true)
  })

  it('still fails a current summary the model left uncited', async () => {
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })
    const saved = { ...cvWith('Migrated the checkout flow'), summary: 'Engineer.' }
    const report = await recheckCv(saved, baseArgs)
    expect(report.uncitedBullets).toEqual(['summary'])
  })

  it('keeps the finished draft when the rewrite call fails', async () => {
    composeCvMock
      .mockResolvedValueOnce(cvWith('Single-handedly rebuilt checkout'))
      .mockRejectedValueOnce(Object.assign(new Error('bad'), { kind: 'invalid-output' }))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: false, reason: 'Not alone.' }],
    })
    const { cv, report } = await composeAndVerify(baseArgs)
    expect(cv.experience[0].bullets[0].text).toBe('Single-handedly rebuilt checkout')
    expect(report.distortions).toHaveLength(1)
  })

  it('keeps the paid draft, every line unjudged, when the distortion check itself fails', async () => {
    // 2026-11-19 audit: a thrown first check discarded the finished, paid draft.
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockRejectedValue(new Error('overloaded'))
    const { cv, report } = await composeAndVerify(baseArgs)
    expect(cv.experience[0].bullets[0].text).toBe('Migrated the checkout flow')
    expect(report.distortions).toEqual([
      { bulletId: 'b1', reason: 'distortion check returned no verdict for this text' },
    ])
    expect(report.passed).toBe(false)
    expect(composeCvMock).toHaveBeenCalledTimes(1)
  })

  it('never lets one verdict stand for two lines that share an id', async () => {
    // Verdicts were matched by id: with two "b1" lines, the last verdict
    // answered for both, and a flagged line could pass.
    const { verifyDistortions } = await import('@/lib/ai/distortions')
    callStructuredMock.mockResolvedValueOnce({
      verdicts: [
        { bulletId: 'b1', supported: true, reason: '' },
        { bulletId: 'b1#2', supported: false, reason: 'Not on record.' },
      ],
    })
    const flags = await verifyDistortions(
      [
        { id: 'b1', text: 'Migrated checkout', citedEvidenceIds: ['ev_1'] },
        { id: 'b1', text: 'Led a team of 40', citedEvidenceIds: ['ev_1'] },
      ],
      evidence,
      new Map(),
    )
    expect(flags).toEqual([{ bulletId: 'b1', reason: 'Not on record.' }])
  })

  it('fails closed, not loudly, when the retry for a skipped line fails', async () => {
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock
      .mockResolvedValueOnce({ verdicts: [] })
      .mockRejectedValueOnce(new Error('overloaded'))
    const { report } = await composeAndVerify(baseArgs)
    expect(report.distortions).toEqual([
      { bulletId: 'b1', reason: 'distortion check returned no verdict for this text' },
    ])
    // A line never judged is no reason to pay for a rewrite.
    expect(composeCvMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a rewrite that buys fewer flags by deleting the skills section', async () => {
    const draft = {
      ...cvWith('Single-handedly rebuilt checkout'),
      skills: [{ category: 'Tech', items: ['Checkout'] }],
    }
    composeCvMock.mockResolvedValueOnce(draft).mockResolvedValueOnce({ ...draft, skills: [] })
    callStructuredMock
      .mockResolvedValueOnce({
        verdicts: [
          { bulletId: 'b1', supported: true, reason: '' },
          { bulletId: 'skills', supported: false, reason: '"Checkout" is not a skill on file.' },
        ],
      })
      .mockResolvedValue({ verdicts: [{ bulletId: 'b1', supported: true, reason: '' }] })
    const { cv } = await composeAndVerify(baseArgs)
    expect(cv.skills).toEqual(draft.skills)
  })

  it('refuses a rewrite that drops an extras line it was not told to touch', async () => {
    const draft = {
      ...cvWith('Single-handedly rebuilt checkout'),
      extras: [{ heading: 'Other', lines: ['Available to travel'] }],
    }
    composeCvMock.mockResolvedValueOnce(draft).mockResolvedValueOnce({
      ...cvWith('Helped the team migrate checkout'),
      education: [],
      extras: [],
    })
    callStructuredMock.mockResolvedValueOnce({
      verdicts: [{ bulletId: 'b1', supported: false, reason: 'Not alone.' }],
    })
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })
    const { cv } = await composeAndVerify(baseArgs)
    expect(cv).toEqual(draft)
  })

  it('tells the checker which role is being applied for', async () => {
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })
    await composeAndVerify({ ...baseArgs, jobTitle: 'Head of Payments' })
    expect(callStructuredMock.mock.calls[0][0].user).toContain('The role being applied for')
    expect(callStructuredMock.mock.calls[0][0].user).toContain('Head of Payments')
  })

  it("shows a role record its role's title and employer", async () => {
    // A live run: a summary naming the employer was flagged because the checker
    // never saw which company the recorded work was done for.
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })
    await composeAndVerify(baseArgs)
    expect(callStructuredMock.mock.calls[0][0].user).toContain('[role] Engineer at Tiendamax')
  })

  it('shows a project record its project line, so a stated stack is not judged unsupported', async () => {
    // A live run flagged "built it in TypeScript with the Claude API" as
    // unsupported: the stack lived on the project, not in the record.
    const projectRecord: EvidenceItem = {
      ...evidence[0],
      id: 'ev_p',
      sourceRef: { type: 'project', id: 'proj_1' },
      text: 'Built a shelf tracker',
      metrics: [],
    }
    const withProject = {
      ...baseArgs,
      profile: {
        ...profile,
        projects: [
          {
            id: 'proj_1',
            name: 'Shelf Tracker',
            description: '',
            stack: ['TypeScript'],
            period: { start: '2024-03' },
          },
        ],
      },
      evidence: [...evidence, projectRecord],
      mappings: [
        { requirementId: 'r1', evidenceIds: ['ev_p'], strength: 'strong' as const, rationale: '' },
      ],
    }
    composeCvMock.mockResolvedValue({
      ...cvWith('x'),
      experience: [],
      projects: [
        {
          projectId: 'proj_1',
          name: 'Shelf Tracker',
          bullets: [
            {
              id: 'b1',
              text: 'Built it in TypeScript',
              citedEvidenceIds: ['ev_p'],
              keywordsUsed: [],
            },
          ],
        },
      ],
    })
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    const { report } = await composeAndVerify(withProject)
    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    expect(call).toContain('Built a shelf tracker')
    expect(call).toContain(
      '[project] proj_1 | Shelf Tracker (own project, not an employer) | stack: TypeScript',
    )
    expect(report.passed).toBe(true)
  })

  it('shows the checker the recorded metrics, not just the text', async () => {
    // A live run flagged "8x ROAS" as unsupported: the figure was stored only
    // as a metric, which the code checks accepted and the model never saw.
    composeCvMock.mockResolvedValue(cvWith('Migrated the checkout flow'))
    callStructuredMock.mockResolvedValue({
      verdicts: [{ bulletId: 'b1', supported: true, reason: '' }],
    })

    await composeAndVerify({
      ...baseArgs,
      evidence: [
        { ...evidence[0], metrics: [{ raw: 'ROAS de 8x en seasonalities', value: 8, unit: 'x' }] },
      ],
    })
    expect(JSON.stringify(callStructuredMock.mock.calls[0])).toContain(
      '(recorded metrics: ROAS de 8x en seasonalities)',
    )
  })
})
