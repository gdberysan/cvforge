import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const callStructuredMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))

const { composeVariant, checkVariantFor } = await import('@/lib/variants')
const { openDb, runMigrations } = await import('@/lib/db/client')
const queries = await import('@/lib/db/queries/cv-variants')
const { resolveCvSource } = await import('@/lib/render/cv-source')
const { estimatePages, TRANSLATION_HEADROOM } = await import('@/lib/render/page-budget')

import type {
  CVContent,
  EvidenceItem,
  EvidenceMapping,
  GroundingReport,
  MasterProfile,
  Requirement,
} from '@/lib/schemas'

function withDb(fn: (handle: import('@/lib/db/client').Db) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
  const { db: handle, close } = openDb(path.join(dir, 'test.db'))
  try {
    runMigrations(handle)
    fn(handle)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

function ev(id: string, text = `text of ${id}`): EvidenceItem {
  return {
    id,
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text,
    metrics: [],
    tags: [],
    period: { start: '2020-01' },
    strength: 'core',
    origin: 'manual',
  }
}

const profile: MasterProfile = {
  basics: {
    fullName: 'Ana',
    headline: 'Marketer',
    email: 'g@b.com',
    location: 'CDMX',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  experience: [
    {
      id: 'exp_1',
      title: 'Growth Lead',
      company: 'Tiendamax',
      period: { start: '2020-01' },
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
  updatedAt: '2026-10-14T00:00:00.000Z',
}

function cvWith(bullets: { id: string; text: string; cites: string[] }[]): CVContent {
  return {
    header: { fullName: 'Ana', title: 'Growth Lead', contactLines: [] },
    summary: '',
    summaryCitedEvidenceIds: [],
    experience: [
      {
        experienceId: 'exp_1',
        title: 'Growth Lead',
        company: 'Tiendamax',
        startDate: '2020-01',
        bullets: bullets.map((b) => ({
          id: b.id,
          text: b.text,
          citedEvidenceIds: b.cites,
          keywordsUsed: [],
        })),
      },
    ],
    projects: [],
    education: [],
    skills: [],
    extras: [],
  }
}

const cleanReport: GroundingReport = {
  uncitedBullets: [],
  invalidCitations: [],
  unverifiedNumbers: [],
  unknownEntities: [],
  distortions: [],
  claimedGaps: [],
  unsupportedClaims: [],
  passed: true,
}

describe('composeVariant', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('offers every evidence item and steers by the focus, not by requirements', async () => {
    callStructuredMock.mockResolvedValueOnce({ ...cvWith([]), projects: [] })
    await composeVariant({
      brief: { name: 'AI & automation', focus: 'LLM tooling roles', language: 'en', market: 'mx' },
      profile,
      evidence: [ev('ev_1'), ev('ev_2'), ev('ev_3')],
    })
    const call = JSON.stringify(callStructuredMock.mock.calls[0])
    for (const id of ['ev_1', 'ev_2', 'ev_3']) expect(call).toContain(id)
    expect(call).toContain('<target-focus>')
    expect(call).toContain('LLM tooling roles')
    expect(call).not.toContain('<requirements-to-address>')
    expect(call).toContain('No company')
  })
})

describe('composeVariant fits the page with room for its translation', () => {
  beforeEach(() => callStructuredMock.mockReset())

  it('composes every base CV to the limit minus the translation headroom', async () => {
    const long =
      'Lideré la estrategia de marketplaces y medios de performance para la categoría, coordinando equipos de catálogo, pricing y logística con resultados medibles.'
    const draft = cvWith(
      Array.from({ length: 40 }, (_, i) => ({
        id: `b${i}`,
        text: `${long} (${i})`,
        cites: ['ev_1'],
      })),
    )
    callStructuredMock.mockImplementation(async (call?: { stage: string }) =>
      call?.stage === 'compose-cv'
        ? { ...draft, header: { title: 'Growth Lead' } }
        : { verdicts: [] },
    )
    const { cv } = await composeVariant({
      brief: { name: 'Growth Lead', focus: 'Growth roles', language: 'es-MX', market: 'mx' },
      profile,
      evidence: [ev('ev_1')],
    })
    expect(estimatePages(cv)).toBeLessThanOrEqual(2 - TRANSLATION_HEADROOM)
  })
})

describe('checkVariantFor', () => {
  it('judges the header title against the base CV name, never against itself', () => {
    const cv = cvWith([{ id: 'b1', text: 'Grew organic traffic', cites: ['ev_2'] }])
    const report = checkVariantFor({
      cv: { ...cv, header: { ...cv.header, title: 'Head of Growth' } },
      name: 'Growth Lead',
      composedReport: cleanReport,
      profile,
      evidence: [ev('ev_1'), ev('ev_2', 'Grew organic traffic')],
      requirements: [],
      mappings: [],
    })
    expect(report.unsupportedClaims).toContainEqual({ bulletId: 'title', text: 'Head of Growth' })
    expect(report.passed).toBe(false)
  })

  const requirements: Requirement[] = [
    {
      id: 'r1',
      text: 'Kubernetes',
      keyword: 'Kubernetes',
      variants: [],
      kind: 'hard',
      mandatory: true,
      weight: 3,
    },
  ]
  const mappings: EvidenceMapping[] = [
    // The posting's analysis used only ev_1 and found nothing for Kubernetes.
    { requirementId: 'r1', evidenceIds: [], strength: 'none', rationale: '' },
  ]

  it('does not flag citations of evidence this posting did not map', () => {
    const report = checkVariantFor({
      cv: cvWith([{ id: 'b1', text: 'Grew organic traffic', cites: ['ev_2'] }]),
      name: 'Growth Lead',
      composedReport: cleanReport,
      profile,
      evidence: [ev('ev_1'), ev('ev_2', 'Grew organic traffic')],
      requirements,
      mappings,
    })
    expect(report.invalidCitations).toEqual([])
    expect(report.passed).toBe(true)
  })

  it("flags a bullet claiming this posting's gap, as a custom CV would be", () => {
    const report = checkVariantFor({
      cv: cvWith([{ id: 'b1', text: 'Ran Kubernetes clusters', cites: ['ev_1'] }]),
      name: 'Growth Lead',
      composedReport: cleanReport,
      profile,
      evidence: [ev('ev_1', 'Ran Kubernetes clusters')],
      requirements,
      mappings,
    })
    expect(report.claimedGaps.map((g) => g.bulletId)).toEqual(['b1'])
    expect(report.passed).toBe(false)
  })

  it('flags a citation whose evidence was deleted since composing', () => {
    const report = checkVariantFor({
      cv: cvWith([{ id: 'b1', text: 'Grew organic traffic', cites: ['ev_gone'] }]),
      name: 'Growth Lead',
      composedReport: cleanReport,
      profile,
      evidence: [ev('ev_1')],
      requirements: [],
      mappings: [],
    })
    expect(report.invalidCitations).toEqual([{ bulletId: 'b1', evidenceId: 'ev_gone' }])
    expect(report.passed).toBe(false)
  })

  it('carries the compose-time distortion verdicts', () => {
    const report = checkVariantFor({
      cv: cvWith([{ id: 'b1', text: 'Grew organic traffic', cites: ['ev_1'] }]),
      name: 'Growth Lead',
      composedReport: { ...cleanReport, distortions: [{ bulletId: 'b1', reason: 'overstated' }] },
      profile,
      evidence: [ev('ev_1', 'Grew organic traffic')],
      requirements: [],
      mappings: [],
    })
    expect(report.distortions).toEqual([{ bulletId: 'b1', reason: 'overstated' }])
    expect(report.passed).toBe(false)
  })
})

describe('cv variant storage', () => {
  it('keeps the brief before composing and the CV after, and recomposing keeps the id', () => {
    withDb((handle) => {
      const id = queries.upsertVariantBrief(handle, {
        name: 'E-commerce',
        focus: 'Marketplace growth',
        language: 'es-MX',
        market: 'mx',
      })
      expect(queries.getVariant(handle, id)?.cv).toBeNull()
      expect(resolveCvSource(handle, new URLSearchParams({ variantId: id }))).toMatchObject({
        ok: false,
        status: 409,
        // A dictionary key the route translates, never an English sentence.
        error: 'export.variantNotComposed',
      })

      const cv = cvWith([{ id: 'b1', text: 'Grew sales', cites: ['ev_1'] }])
      queries.saveVariantCv(handle, id, { cv, report: cleanReport, evidenceHash: 'h1' })
      queries.upsertVariantBrief(handle, {
        id,
        name: 'E-commerce MX',
        focus: 'Marketplace growth, Amazon and Mercado Norte',
        language: 'es-MX',
        market: 'mx',
      })

      const [stored] = queries.listVariants(handle)
      expect(stored.name).toBe('E-commerce MX')
      expect(stored.cv?.experience[0].bullets[0].text).toBe('Grew sales')
      expect(stored.evidenceHash).toBe('h1')

      const resolved = resolveCvSource(handle, new URLSearchParams({ variantId: id }))
      expect(resolved).toMatchObject({
        ok: true,
        source: { label: 'E-commerce MX', language: 'es-MX' },
      })

      queries.deleteVariant(handle, id)
      expect(queries.listVariants(handle)).toEqual([])
    })
  })
})
