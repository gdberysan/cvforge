import { describe, expect, it } from 'vitest'
import type { ApplicationRecord } from '@/lib/db/queries/applications'
import { demoTriageEvents } from '@/lib/demo/triage-events'

const app = {
  id: 'app_demo_1',
  company: 'Grupo Andino Retail',
  jobTitle: 'Coordinador(a) de Marketing Digital',
  requirements: [
    {
      id: 'req_1',
      text: 'x',
      keyword: 'Meta Ads',
      variants: [],
      kind: 'hard',
      mandatory: true,
      weight: 3,
    },
  ],
  mappings: [
    { requirementId: 'req_1', evidenceIds: ['ev_demo_01'], strength: 'strong', rationale: '' },
  ],
  coverage: {
    mandatoryTotal: 1,
    mandatoryStrong: 1,
    mandatoryPartial: 0,
    mandatoryMissing: 0,
    desirableTotal: 0,
    desirableStrong: 0,
    desirablePartial: 0,
    desirableMissing: 0,
    hardBlockers: [],
    verdict: 'strong',
  },
} as unknown as ApplicationRecord

describe('demoTriageEvents', () => {
  it('plays the real stage sequence and ends on the seeded result', () => {
    const events = demoTriageEvents(app)
    expect(
      events.map((e) => (e.event as { stage?: string; done?: boolean }).stage ?? 'done'),
    ).toEqual(['extracting', 'mapping', 'saving', 'done'])
    const done = events.at(-1)?.event as Record<string, unknown>
    expect(done).toMatchObject({
      done: true,
      applicationId: 'app_demo_1',
      cached: false,
      company: 'Grupo Andino Retail',
    })
    expect(done.coverage).toEqual(app.coverage)
  })

  it('takes a few seconds in total, never more than eight', () => {
    const total = demoTriageEvents(app).reduce((s, e) => s + e.delayMs, 0)
    expect(total).toBeGreaterThanOrEqual(2500)
    expect(total).toBeLessThanOrEqual(8000)
  })
})
