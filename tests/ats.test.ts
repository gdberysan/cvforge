import { describe, expect, it } from 'vitest'
import { atsReport } from '@/lib/ats'
import type { CVContent } from '@/lib/schemas'

const cv = {
  header: { fullName: 'Ana', title: 'Paid Media Lead', contactLines: [] },
  summary: 'Paid media lead who runs Google Ads and Meta campaigns.',
  summaryCitedEvidenceIds: [],
  experience: [
    {
      experienceId: 'exp_1',
      title: 'Paid Media Lead',
      company: 'Acme',
      startDate: '2021-03',
      bullets: [
        { id: 'b1', text: 'Cut CPA 18% with SQLite-backed reporting', citedEvidenceIds: ['ev_1'] },
      ],
    },
  ],
  projects: [],
  education: [],
  skills: [{ category: 'Tools', items: ['GA4'] }],
  extras: [],
} as unknown as CVContent

const req = (
  id: string,
  keyword: string,
  kind = 'hard',
  mandatory = true,
  variants: string[] = [],
) => ({ id, keyword, variants, kind, mandatory, text: keyword, weight: 2 }) as never

describe('atsReport', () => {
  it('sorts the terms into said, supported but left out, and rightly not claimed', () => {
    const report = atsReport(
      cv,
      [
        req('r1', 'Google Ads'),
        req('r2', 'Google Analytics', 'hard', true, ['GA4']),
        req('r3', 'SQL'),
        req('r4', 'Kubernetes'),
        req('r5', 'Remote from Mexico', 'location'),
        req('r6', 'TikTok Ads', 'hard', false),
      ],
      [
        { requirementId: 'r1', strength: 'strong', evidenceIds: ['ev_1'], rationale: '' },
        { requirementId: 'r2', strength: 'partial', evidenceIds: ['ev_1'], rationale: '' },
        { requirementId: 'r3', strength: 'strong', evidenceIds: ['ev_1'], rationale: '' },
        { requirementId: 'r6', strength: 'none', evidenceIds: [], rationale: '' },
      ] as never,
    )
    const status = Object.fromEntries(report.rows.map((r) => [r.keyword, r.status]))
    expect(status).toEqual({
      'Google Ads': 'on-cv',
      'Google Analytics': 'on-cv',
      // "SQLite" is not "SQL": whole words only.
      SQL: 'supported-missing',
      Kubernetes: 'no-evidence',
      'TikTok Ads': 'no-evidence',
    })
    // A location is a fact about the person, not a term the CV is matched on.
    expect(report.rows.some((r) => r.keyword === 'Remote from Mexico')).toBe(false)
    expect(report.rows.find((r) => r.keyword === 'Google Analytics')?.matched).toBe('GA4')
    // The fixable ones come first.
    expect(report.rows[0]?.status).toBe('supported-missing')
    expect([report.onCvMandatory, report.supportedMandatory]).toEqual([2, 3])
  })
})
