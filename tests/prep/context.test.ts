import { describe, expect, it } from 'vitest'
import { buildPrepContext, renderPrepPayload } from '@/lib/prep/context'
import type { EvidenceItem } from '@/lib/schemas'
import { bidTool, cv, funnel, input } from './fixtures'

const NOW = Date.parse('2026-10-18T09:00:00Z')

describe('buildPrepContext', () => {
  it('prefers the CV kept at send time', () => {
    const ctx = buildPrepContext(
      input({
        application: {
          ...input().application,
          documents: { cv: cv('Later'), sentCv: cv('As sent') },
        },
      }),
      NOW,
    )
    expect(ctx.cv?.header.title).toBe('As sent')
    expect(ctx.cvIsSnapshot).toBe(true)
  })

  it('uses documents.cv when nothing was kept, and null when there is no CV at all', () => {
    expect(buildPrepContext(input(), NOW).cvIsSnapshot).toBe(false)
    const none = buildPrepContext(
      input({ application: { ...input().application, documents: null } }),
      NOW,
    )
    expect(none.cv).toBeNull()
  })

  it('includes every mapping-cited record and caps the extra core ones at 30, newest first', () => {
    const many: EvidenceItem[] = Array.from({ length: 40 }, (_, i) => ({
      ...funnel,
      id: `ev_core_${i}`,
      text: `core ${i}`,
      period: { start: '2020-01', end: `20${String(10 + Math.floor(i / 3)).padStart(2, '0')}-01` },
    }))
    const ctx = buildPrepContext(input({ evidence: [funnel, bidTool, ...many] }), NOW)
    const ids = ctx.evidence.map((e) => e.id)
    expect(ids).toContain('ev_funnel')
    expect(ids.filter((id) => id.startsWith('ev_core_'))).toHaveLength(30)
    expect(ids).toContain('ev_core_39')
    expect(ids).not.toContain('ev_core_0')
  })

  it('marks the bullets the saved report flags', () => {
    const ctx = buildPrepContext(
      input({
        application: {
          ...input().application,
          groundingReport: {
            distortions: [{ bulletId: 'b1', reason: 'x' }],
            unsupportedClaims: [],
          },
        },
      }),
      NOW,
    )
    expect(ctx.flaggedBulletIds).toEqual(['b1'])
  })

  it('uses the people of the round’s event, else everyone', () => {
    const people = [
      {
        id: 'p1',
        applicationId: 'app_1',
        outcomeEventId: 'i',
        name: 'Marco Ibarra',
        email: '',
        role: 'Sr. Manager',
        roleQuote: 'q',
        source: 'mail' as const,
        hidden: false,
      },
      {
        id: 'p2',
        applicationId: 'app_1',
        outcomeEventId: null,
        name: 'Tomás García',
        email: '',
        role: '',
        roleQuote: '',
        source: 'invite' as const,
        hidden: false,
      },
    ]
    const outcomes = [
      {
        id: 'i',
        at: '2026-10-16T00:00:00Z',
        type: 'interview' as const,
        note: null,
        scheduledAt: '2026-10-20T16:45:00.000Z',
        meetingUrl: null,
      },
    ]
    const ctx = buildPrepContext(
      input({ people, application: { ...input().application, outcomes } }),
      NOW,
    )
    expect(ctx.people.map((p) => p.name)).toEqual(['Marco Ibarra'])
    const noEvent = buildPrepContext(input({ people }), NOW)
    expect(noEvent.people).toHaveLength(2)
  })
})

describe('buildPrepContext people (final review #4)', () => {
  it('gives the prep the people he added by hand beside the call’s own', () => {
    const base = { applicationId: 'app_1', email: '', roleQuote: '', hidden: false }
    const people = [
      {
        ...base,
        id: 'p1',
        outcomeEventId: 'i',
        name: 'Marco Ibarra',
        role: 'Sr. Manager',
        source: 'invite' as const,
      },
      {
        ...base,
        id: 'p2',
        outcomeEventId: null,
        name: 'Ana Ruiz',
        role: 'RR.HH.',
        source: 'manual' as const,
      },
    ]
    const outcomes = [
      {
        id: 'i',
        at: '2026-10-16T00:00:00Z',
        type: 'interview' as const,
        note: null,
        scheduledAt: '2026-10-20T16:45:00.000Z',
        meetingUrl: null,
      },
    ]
    const ctx = buildPrepContext(
      input({ people, application: { ...input().application, outcomes } }),
      NOW,
    )
    expect(ctx.people.map((p) => p.name)).toEqual(['Marco Ibarra', 'Ana Ruiz'])
  })
})

describe('renderPrepPayload', () => {
  it('carries the sent CV, the interviewer with an unknown role, and his answers', () => {
    const ctx = buildPrepContext(
      input({
        people: [
          {
            id: 'p',
            applicationId: 'app_1',
            outcomeEventId: null,
            name: 'Tomás García',
            email: '',
            role: '',
            roleQuote: '',
            source: 'invite',
            hidden: false,
          },
        ],
        evidence: [funnel, { ...bidTool, strength: 'core' }],
        answers: [
          {
            id: 'ans_1',
            applicationId: 'app_1',
            evidenceIds: ['ev_funnel'],
            part: 'T',
            question: '¿Meta?',
            answer: 'Subir la CR',
            createdAt: '',
          },
        ],
      }),
      NOW,
    )
    const payload = renderPrepPayload(ctx)
    expect(payload).toContain('<sent_cv')
    expect(payload).toContain('id="b1"')
    expect(payload).toContain('Tomás García — role unknown')
    expect(payload).toContain('<his_answers>')
    expect(payload).toContain('answer:ans_1')
    expect(payload).toContain('[project] prj_1 | Bid Tool (own project, not an employer)')
  })

  it('keeps a quote mark in his words from closing an attribute early', () => {
    const base = input()
    const ctx = buildPrepContext(
      input({
        application: { ...base.application, company: 'Acme "MX"', jobTitle: 'Lead "Growth"' },
        answers: [
          {
            id: 'ans_1',
            applicationId: 'app_1',
            evidenceIds: ['ev_funnel'],
            part: 'T',
            question: 'What did "done" mean?',
            answer: 'Subir la CR',
            createdAt: '',
          },
        ],
      }),
      NOW,
    )
    const payload = renderPrepPayload(ctx)
    expect(payload).toContain('question="What did &quot;done&quot; mean?"')
    expect(payload).toContain('company="Acme &quot;MX&quot;"')
    expect(payload).toContain('title="Lead &quot;Growth&quot;"')
  })
})
