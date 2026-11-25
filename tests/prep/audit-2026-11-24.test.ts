import { describe, expect, it } from 'vitest'
import { buildPrepContext, renderPrepPayload, roleMonths } from '@/lib/prep/context'
import { sanitizePrep } from '@/lib/prep/sanitize'
import { checkPrepInCode, findPrepTells } from '@/lib/prep/verify'
import type { EvidenceItem } from '@/lib/schemas'
import { must } from '../support/must'
import { funnel, input, profile } from './fixtures'
import { rawPrep } from './raw'

/**
 * What the live audit of 2026-11-24 found in two real preps, each pinned
 * here: an 8-month role told as "the year", "owned" over a record of
 * executing, two records joined by an invented "con eso", "my record" in his
 * mouth, one story stretched over five questions, an empty gap card, and a
 * prompt that never saw the posting.
 */
const NOW = Date.parse('2026-11-24T12:00:00Z')

const shortRole = {
  ...profile,
  experience: [
    ...profile.experience,
    {
      id: 'exp_2',
      title: 'Account Partner',
      company: 'Market',
      period: { start: '2024-02', end: '2024-09' },
      summary: '',
    },
  ],
}
const consultant: EvidenceItem = {
  ...funnel,
  id: 'ev_media',
  sourceRef: { type: 'experience', id: 'exp_2' },
  text: 'Seguimiento de metas y ejecución del presupuesto de campañas',
  metrics: [],
  period: { start: '2024-02', end: '2024-09' },
}
const sql: EvidenceItem = {
  ...funnel,
  id: 'ev_sql',
  text: 'Saqué reportes de ventas desde el CRM',
  metrics: [],
}
const tool: EvidenceItem = {
  ...funnel,
  id: 'ev_tool',
  text: 'Armé un tablero de ventas que adoptó el equipo comercial',
  metrics: [],
}

const ctx = () =>
  buildPrepContext(
    input({
      profile: shortRole,
      evidence: [funnel, consultant, sql, tool],
      application: {
        ...input().application,
        postingRaw: 'We are hiring. Explore, experiment, scale.',
      },
    }),
    NOW,
  )
const kinds = (c = ctx(), mut: (r: ReturnType<typeof rawPrep>) => void = () => {}) => {
  const raw = rawPrep()
  mut(raw)
  return checkPrepInCode(sanitizePrep(raw, c), c).map((f) => `${f.kind}@${f.path}`)
}

describe('roleMonths', () => {
  it('counts both ends: February to September is 8 months', () => {
    expect(roleMonths({ start: '2024-02', end: '2024-09' }, new Date(NOW))).toBe(8)
  })
  it('runs an open role to now', () => {
    expect(roleMonths({ start: '2026-01' }, new Date(NOW))).toBe(11)
  })
})

describe('the payload', () => {
  it('shows the posting and every role with its months', () => {
    const p = renderPrepPayload(ctx())
    expect(p).toContain('<posting>\nWe are hiring. Explore, experiment, scale.\n</posting>')
    expect(p).toMatch(/<role id="exp_2" ended="true">[^<]*\| 8 months<\/role>/)
  })
})

describe('the wording checks', () => {
  it('flags "the year" said of an 8-month role', () => {
    const out = kinds(ctx(), (r) => {
      must(r.gapAnswers[0]).bridge = {
        text: 'In 2024 I spent the year as a consultant.',
        citedEvidenceIds: ['ev_media'],
      }
    })
    expect(out).toContain('duration@gapAnswers.g1.bridge')
  })

  it('flags "owned" when the record says execution', () => {
    const out = kinds(ctx(), (r) => {
      must(r.stories[0]).action = {
        text: 'I owned the budget and ROAS.',
        citedEvidenceIds: ['ev_media'],
        ask: '',
        ideas: [],
      }
    })
    expect(out).toContain('inflation@stories.s1.action')
  })

  it('flags two records joined by a link neither states, and not one record told plainly', () => {
    const joined = kinds(ctx(), (r) => {
      must(r.stories[0]).action = {
        text: 'Sacaba reportes del CRM. Con eso armé un tablero de ventas.',
        citedEvidenceIds: ['ev_sql', 'ev_tool'],
        ask: '',
        ideas: [],
      }
    })
    expect(joined).toContain('link@stories.s1.action')
    const sideBySide = kinds(ctx(), (r) => {
      must(r.stories[0]).action = {
        text: 'Sacaba reportes del CRM. También armé un tablero de ventas.',
        citedEvidenceIds: ['ev_sql', 'ev_tool'],
        ask: '',
        ideas: [],
      }
    })
    expect(sideBySide.filter((k) => k.startsWith('link@'))).toEqual([])
  })

  it('hears "my record" in a spoken line as a tell', () => {
    const c = ctx()
    const raw = rawPrep()
    must(raw.gapAnswers[0]).admit = 'My record does not show Excel macros.'
    const tells = findPrepTells(sanitizePrep(raw, c), 'en', c)
    expect(tells.some((t) => t.phrases.some((p) => p.includes('my record')))).toBe(true)
  })
})

describe('honest coverage', () => {
  it('lets a story answer at most two questions, in the model’s order', () => {
    const c = ctx()
    const raw = rawPrep()
    const q = must(raw.questions[0])
    raw.questions = [1, 2, 3, 4].map((n) => ({ ...q, id: `q${n}`, answeredBy: 's1' }))
    const out = sanitizePrep(raw, c)
    expect(out.questions.map((x) => x.answeredBy)).toEqual(['s1', 's1', '', ''])
    expect(out.coverage.filter((x) => x.by === 'story')).toHaveLength(2)
  })

  it('drops a gap card with nothing to admit, and the question falls back to none', () => {
    const c = ctx()
    const raw = rawPrep()
    must(raw.gapAnswers[0]).admit = '  '
    const out = sanitizePrep(raw, c)
    expect(out.gapAnswers).toEqual([])
    expect(out.coverage.find((x) => x.questionId === 'q2')?.by).toBe('none')
  })

  it('keeps at most five questions to ask, trimmed, none empty', () => {
    const c = ctx()
    const raw = rawPrep()
    raw.askThem = [' A? ', '', 'B?', 'C?', 'D?', 'E?', 'F?'].map((text) => ({ text, why: ' w ' }))
    const out = sanitizePrep(raw, c)
    expect(out.askThem?.map((a) => a.text)).toEqual(['A?', 'B?', 'C?', 'D?', 'E?'])
    expect(out.askThem?.[0]?.why).toBe('w')
  })
})

describe('the second audit (v2)', () => {
  it('marks a CV figure its records lack, in code', () => {
    const c = ctx()
    const raw = rawPrep()
    const bulletId = must(c.cv?.experience[0]?.bullets[0]).id
    raw.cvDefense = [
      { bulletId, likelyQuestion: 'How?', facts: { text: 'I set it up.', citedEvidenceIds: [] } },
    ]
    const cv = must(c.cv)
    must(cv.experience[0]?.bullets[0]).text = 'Grew sales above 30% a quarter'
    must(cv.experience[0]?.bullets[0]).citedEvidenceIds = ['ev_media']
    const out = sanitizePrep(raw, c)
    expect(out.cvDefense[0]?.unsupported).toEqual(['30%'])
  })

  it('hears "para los datos" and "esos datos alimentaban" as links', () => {
    for (const text of [
      'Para los datos sacaba reportes del CRM.',
      'Esos datos alimentaban el tablero de ventas que armé.',
    ]) {
      const out = kinds(ctx(), (r) => {
        must(r.stories[0]).action = {
          text,
          citedEvidenceIds: ['ev_sql', 'ev_tool'],
          ask: '',
          ideas: [],
        }
      })
      expect(out).toContain('link@stories.s1.action')
    }
  })

  it('flags "running the budget" over a record of executing it', () => {
    const out = kinds(ctx(), (r) => {
      must(r.stories[0]).action = {
        text: 'I was running the budget for the key accounts.',
        citedEvidenceIds: ['ev_media'],
        ask: '',
        ideas: [],
      }
    })
    expect(out).toContain('inflation@stories.s1.action')
  })
})
