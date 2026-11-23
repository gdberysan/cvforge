import { describe, expect, it } from 'vitest'
import {
  buildPrepContext,
  renderPrepPayload,
  termPattern,
  uncitedMentions,
} from '@/lib/prep/context'
import { keepsPrepSubstance } from '@/lib/prep/pipeline'
import { sanitizePrep } from '@/lib/prep/sanitize'
import { checkPrepInCode } from '@/lib/prep/verify'
import type { EvidenceItem } from '@/lib/schemas'
import { must } from '../support/must'
import { funnel, input, mappings, requirements } from './fixtures'
import { rawPrep } from './raw'

const NOW = Date.parse('2026-10-18T09:00:00Z')

/** The Halden case: a supporting record nobody cited, naming the "missing" skill. */
const bigQuery: EvidenceItem = {
  ...funnel,
  id: 'ev_sql',
  kind: 'project-highlight',
  text: 'Saqué reportes de ventas con consultas en SQL sobre el data warehouse.',
  metrics: [],
  tags: ['SQL', 'BigQuery'],
  strength: 'supporting',
}
const ctx = (evidence: EvidenceItem[] = [funnel, bigQuery]) =>
  buildPrepContext(input({ evidence }), NOW)
const paths = (flags: { path: string; kind: string }[]) => flags.map((f) => `${f.kind}@${f.path}`)

describe('termPattern', () => {
  it('matches a capitalised term exactly, so "Make" the platform is not "make" the verb', () => {
    expect(termPattern('Make').test('Built flows in Make and Zapier')).toBe(true)
    expect(termPattern('Make').test('I make dashboards')).toBe(false)
    expect(termPattern('SQL').test('wrote MySQL procedures')).toBe(false)
  })

  it('bends case for an all-lowercase term', () => {
    expect(termPattern('n8n').test('Workflows in N8N')).toBe(true)
  })
})

describe('uncitedMentions', () => {
  it('finds an uncited record naming an uncovered hard requirement, in text or tags', () => {
    const out = uncitedMentions(requirements, mappings, [funnel, bigQuery])
    expect(out.get('req_2')).toEqual(['ev_sql'])
    expect(
      uncitedMentions(requirements, mappings, [{ ...bigQuery, text: 'Reportes', tags: ['SQL'] }]),
    ).toEqual(new Map([['req_2', ['ev_sql']]]))
  })

  it('leaves strongly covered and soft requirements alone', () => {
    const analytics = { ...bigQuery, id: 'ev_an', text: 'analytics and teamwork' }
    const out = uncitedMentions(requirements, mappings, [analytics])
    expect(out.has('req_1')).toBe(false)
    expect(out.has('req_3')).toBe(false)
  })
})

describe('the prep sees what the mapping missed', () => {
  it('shows the record to the model and names it on the requirement', () => {
    const c = ctx()
    expect(c.evidence.map((e) => e.id)).toContain('ev_sql')
    expect(renderPrepPayload(c)).toMatch(/id="req_2"[^>]*also_named_in="ev_sql"/)
  })

  it('flags a gap answer that admits lacking SQL without touching the SQL record', () => {
    const c = ctx()
    const out = sanitizePrep(rawPrep(), c)
    expect(paths(checkPrepInCode(out, c))).toContain('overlooked@gapAnswers.g1.admit')
  })

  it('clears once the bridge cites the record', () => {
    const c = ctx()
    const raw = rawPrep()
    must(raw.gapAnswers[0]).bridge = {
      text: 'Saqué reportes de ventas con consultas en SQL sobre el data warehouse.',
      citedEvidenceIds: ['ev_sql'],
    }
    expect(paths(checkPrepInCode(sanitizePrep(raw, c), c))).toEqual([])
  })

  it('no longer flags a story that claims SQL as an invented gap', () => {
    const c = ctx()
    const raw = rawPrep()
    raw.gapAnswers = []
    must(raw.stories[0]).action = {
      text: 'Saqué reportes de ventas con consultas en SQL sobre el data warehouse.',
      citedEvidenceIds: ['ev_sql'],
      ask: '',
      ideas: [],
    }
    const flags = paths(checkPrepInCode(sanitizePrep(raw, c), c))
    expect(flags.filter((f) => f.startsWith('gap@'))).toEqual([])
  })

  it('still treats SQL as a gap when no record names it', () => {
    const c = ctx([funnel])
    const raw = rawPrep()
    must(raw.stories[0]).action = {
      text: 'I wrote SQL every day.',
      citedEvidenceIds: ['ev_funnel'],
      ask: '',
      ideas: [],
    }
    expect(paths(checkPrepInCode(sanitizePrep(raw, c), c))).toContain('gap@stories.s1.action')
    expect(
      paths(checkPrepInCode(sanitizePrep(rawPrep(), c), c)).filter((f) =>
        f.startsWith('overlooked'),
      ),
    ).toEqual([])
  })
})

describe('keepsPrepSubstance with an overlooked gap answer', () => {
  it('lets the refine turn that gap answer into a story, and only that one', () => {
    const c = ctx()
    const before = sanitizePrep(rawPrep(), c)
    const after = { ...before, gapAnswers: [] }
    expect(keepsPrepSubstance(before, after, new Set(), new Set(['g1']))).toBe(true)
    expect(keepsPrepSubstance(before, after, new Set(['gapAnswers.g1.admit']))).toBe(false)
  })
})

describe('know notes', () => {
  it('keeps field knowledge without figures and drops one that carries a figure', () => {
    const raw = rawPrep()
    must(raw.questions[0]).know =
      'En 1P Amazon te compra al mayoreo; en 3P vendes tú y pagas comisión.'
    must(raw.questions[1]).know = 'Amazon cobra 15% de comisión.'
    const out = sanitizePrep(raw, ctx())
    expect(out.questions[0]?.know).toMatch(/^En 1P/)
    expect(out.questions[1]?.know).toBe('')
  })
})
