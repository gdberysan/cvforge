import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { NEUTRAL_SPANISH } from '@/lib/markets'

const callStructuredMock = vi.fn()
vi.mock('@/lib/ai/client', () => ({ callStructured: callStructuredMock }))
// Lets a test make the translation's own save fail after the source was cut.
const failSave = vi.hoisted(() => ({ on: false }))
vi.mock('@/lib/db/queries/cv-variants', async (orig) => {
  const real = await orig<typeof import('@/lib/db/queries/cv-variants')>()
  return {
    ...real,
    saveTranslatedVariant: (...args: Parameters<typeof real.saveTranslatedVariant>) => {
      if (failSave.on) throw new Error('disk full')
      return real.saveTranslatedVariant(...args)
    },
  }
})

const { CVTranslationSchema, targetRule, translationPayloadOf } = await import(
  '@/lib/ai/stages/translate-cv'
)
const { mergeTranslation, translateAndSave, TranslateMismatchError } = await import(
  '@/lib/variant-translation'
)
const { pairVariants } = await import('@/lib/variant-pairs')
const { openDb, runMigrations } = await import('@/lib/db/client')
const queries = await import('@/lib/db/queries/cv-variants')
const { estimatePages } = await import('@/lib/render/page-budget')

import type { CVContent, EvidenceItem, GroundingReport, MasterProfile } from '@/lib/schemas'

function withDb(fn: (handle: import('@/lib/db/client').Db) => Promise<void> | void) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
    const { db: handle, close } = openDb(path.join(dir, 'test.db'))
    try {
      runMigrations(handle)
      await fn(handle)
    } finally {
      close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

const evidence: EvidenceItem[] = [
  {
    id: 'ev_1',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Subí las ventas 40% en Amazon',
    metrics: [{ raw: '40%', value: 40, unit: '%' }],
    tags: [],
    period: { start: '2020-01' },
    strength: 'core',
    origin: 'manual',
  },
  {
    id: 'ev_2',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Lancé la tienda en Mercado Norte',
    metrics: [],
    tags: [],
    period: { start: '2020-01' },
    strength: 'core',
    origin: 'manual',
  },
]

const profile: MasterProfile = {
  basics: {
    fullName: 'Ana',
    headline: 'Growth Lead',
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

const sourceCv: CVContent = {
  header: { fullName: 'Ana', title: 'Growth Lead', contactLines: ['CDMX', 'g@b.com'] },
  summary: 'Growth Lead con foco en marketplaces.',
  summaryCitedEvidenceIds: ['ev_1'],
  experience: [
    {
      experienceId: 'exp_1',
      title: 'Growth Lead',
      company: 'Tiendamax',
      location: 'CDMX',
      startDate: '2020-01',
      bullets: [
        {
          id: 'b1',
          text: 'Subí las ventas 40% en Amazon',
          citedEvidenceIds: ['ev_1'],
          keywordsUsed: [],
        },
        {
          id: 'b2',
          text: 'Lancé la tienda en Mercado Norte',
          citedEvidenceIds: ['ev_2'],
          keywordsUsed: [],
        },
      ],
    },
  ],
  projects: [],
  education: [],
  skills: [],
  extras: [],
}

/** What a faithful model returns: everything translated, structure intact. */
function faithful() {
  return {
    title: 'Growth Lead',
    summary: 'Growth Lead focused on marketplaces.',
    experience: [
      {
        experienceId: 'exp_1',
        title: 'Growth Lead',
        location: 'Mexico City',
        bullets: [
          { id: 'b1', text: 'Grew sales 40% on Amazon' },
          { id: 'b2', text: 'Launched the Mercado Norte store' },
        ],
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

const cleanVerdicts = { verdicts: [] as { bulletId: string; supported: boolean; reason: string }[] }

/** Every line the distortion check is sent for a faithful translation of sourceCv. */
const ALL_LINES = ['title', 'role-exp_1-title', 'summary', 'b1', 'b2']

function supportedAll(ids: string[]) {
  return { verdicts: ids.map((id) => ({ bulletId: id, supported: true, reason: '' })) }
}

describe('the model-facing translation schema', () => {
  it('carries no constraint the grammar cannot enforce', () => {
    const json = JSON.stringify(z.toJSONSchema(CVTranslationSchema))
    for (const banned of ['minLength', 'maxLength', 'pattern', 'enum', 'minItems', 'maxItems'])
      expect(json).not.toContain(banned)
  })

  it('never sends the name or contact lines, nor citations', () => {
    const payload = JSON.stringify(translationPayloadOf(sourceCv))
    expect(payload).not.toContain('g@b.com')
    expect(payload).not.toContain('Ana')
    expect(payload).not.toContain('citedEvidenceIds')
    expect(payload).toContain('Subí las ventas 40% en Amazon')
  })

  it('asks for the voice the composer writes in each language', () => {
    // A live run wrote Spanish bullets in third person ("Administró…").
    expect(targetRule('es-MX', NEUTRAL_SPANISH)).toMatch(/bullets in first person singular/)
    expect(targetRule('es-MX', NEUTRAL_SPANISH)).toContain('Gestioné')
    expect(targetRule('es-MX', NEUTRAL_SPANISH)).toMatch(/never third person/)
    // A live run turned the summary present tense ("Combino…") under a
    // first-person rule meant for bullets: the summary keeps its form.
    expect(targetRule('es-MX', NEUTRAL_SPANISH)).toMatch(/SUMMARY keeps the source's construction/)
    expect(targetRule('es-MX', NEUTRAL_SPANISH)).toMatch(
      /never introduces a present-tense verb about past work/,
    )
    expect(targetRule('en', NEUTRAL_SPANISH)).toMatch(/implied subject/)
    expect(targetRule('en', NEUTRAL_SPANISH)).toContain('Managed')
  })
})

describe('mergeTranslation', () => {
  it('restores ids, citations, experience ids, dates, company and contact lines', () => {
    const draft = faithful()
    // Reordered (same ids): put back in the source's order.
    draft.experience[0].bullets = [
      { id: 'b2', text: 'Launched the Mercado Norte store' },
      { id: 'b1', text: 'Grew sales 40% on Amazon' },
    ]
    const cv = mergeTranslation(sourceCv, draft)
    expect(cv.header).toEqual({
      fullName: 'Ana',
      title: 'Growth Lead',
      contactLines: ['CDMX', 'g@b.com'],
    })
    expect(cv.summaryCitedEvidenceIds).toEqual(['ev_1'])
    const role = cv.experience[0]
    expect(role.experienceId).toBe('exp_1')
    expect(role.company).toBe('Tiendamax')
    expect(role.startDate).toBe('2020-01')
    expect(role.location).toBe('Mexico City')
    // Matched by id, back in the source order, each with its own citation.
    expect(role.bullets.map((b) => [b.id, b.text, b.citedEvidenceIds])).toEqual([
      ['b1', 'Grew sales 40% on Amazon', ['ev_1']],
      ['b2', 'Launched the Mercado Norte store', ['ev_2']],
    ])
  })

  it('a renamed bullet id is a mismatch — never guessed by position', () => {
    const draft = faithful()
    draft.experience[0].bullets = [
      { id: 'x1', text: 'Grew sales 40% on Amazon' },
      { id: 'b2', text: 'Launched the Mercado Norte store' },
    ]
    expect(() => mergeTranslation(sourceCv, draft)).toThrow(TranslateMismatchError)
  })

  it('a duplicated bullet id is a mismatch, even with the count right', () => {
    const draft = faithful()
    draft.experience[0].bullets = [
      { id: 'b1', text: 'Grew sales 40% on Amazon' },
      { id: 'b1', text: 'Launched the Mercado Norte store' },
    ]
    expect(() => mergeTranslation(sourceCv, draft)).toThrow(TranslateMismatchError)
  })

  it('a renamed or swapped role is a mismatch', () => {
    const renamed = faithful()
    renamed.experience[0].experienceId = 'exp_invented'
    expect(() => mergeTranslation(sourceCv, renamed)).toThrow(TranslateMismatchError)

    const twoRoles: CVContent = {
      ...sourceCv,
      experience: [
        sourceCv.experience[0],
        { ...sourceCv.experience[0], experienceId: 'exp_2', bullets: [] },
      ],
    }
    const swapped = faithful()
    swapped.experience = [
      { experienceId: 'exp_2', title: 'Growth Lead', location: '', bullets: [] },
      faithful().experience[0],
    ]
    expect(() => mergeTranslation(twoRoles, swapped)).toThrow(TranslateMismatchError)
  })

  it('a renamed project is a mismatch', () => {
    const withProject: CVContent = {
      ...sourceCv,
      projects: [{ projectId: 'prj_1', name: 'PPC Tool', bullets: [] }],
    }
    const draft = { ...faithful(), projects: [{ projectId: 'prj_9', bullets: [] }] }
    expect(() => mergeTranslation(withProject, draft)).toThrow(TranslateMismatchError)
  })

  it('a dropped bullet is a mismatch, not a shorter CV', () => {
    const draft = faithful()
    draft.experience[0].bullets.pop()
    expect(() => mergeTranslation(sourceCv, draft)).toThrow(TranslateMismatchError)
  })

  it('an added bullet or role is a mismatch', () => {
    const extraBullet = faithful()
    extraBullet.experience[0].bullets.push({ id: 'b3', text: 'Invented' })
    expect(() => mergeTranslation(sourceCv, extraBullet)).toThrow(TranslateMismatchError)
    const extraRole = faithful()
    extraRole.experience.push({ ...extraRole.experience[0] })
    expect(() => mergeTranslation(sourceCv, extraRole)).toThrow(TranslateMismatchError)
  })

  it('copies an extras line naming a recorded certification verbatim; languages translate', () => {
    const withCert: MasterProfile = {
      ...profile,
      certifications: [
        { id: 'cert_1', name: 'Optimización de Conversiones', issuer: 'Google', date: '2024-06' },
      ],
      languages: [{ language: 'Español', level: 'native' }],
    }
    const source: CVContent = {
      ...sourceCv,
      extras: [
        { heading: 'Certificaciones', lines: ['Optimización de Conversiones — Google (2024)'] },
        { heading: 'Idiomas', lines: ['Español — nativo'] },
      ],
    }
    const draft = {
      ...faithful(),
      extras: [
        { heading: 'Certifications', lines: ['Conversion Optimization — Google (2024)'] },
        { heading: 'Languages', lines: ['Spanish — native'] },
      ],
    }
    expect(mergeTranslation(source, draft, withCert).extras).toEqual([
      { heading: 'Certifications', lines: ['Optimización de Conversiones — Google (2024)'] },
      { heading: 'Languages', lines: ['Spanish — native'] },
    ])
  })

  it('keeps an education period whose years the model changed as the source wrote it', () => {
    const source: CVContent = {
      ...sourceCv,
      education: [{ degree: 'Licenciatura', institution: 'UNAM', period: '2010 – 2014' }],
    }
    const draft = {
      ...faithful(),
      // The institution is a proper name: the source's, whatever came back.
      education: [
        { degree: "Bachelor's", institution: 'National University', period: '2011 – 2014' },
      ],
    }
    expect(mergeTranslation(source, draft).education[0]).toEqual({
      degree: "Bachelor's",
      institution: 'UNAM',
      period: '2010 – 2014',
    })
  })
})

describe('translateAndSave', () => {
  beforeEach(() => {
    callStructuredMock.mockReset()
    // A line the checker skipped is asked once more; that retry answers nothing.
    callStructuredMock.mockResolvedValue(cleanVerdicts)
  })

  function seedSource(handle: import('@/lib/db/client').Db): string {
    const id = queries.upsertVariantBrief(handle, {
      name: 'E-commerce',
      focus: 'Marketplace growth',
      language: 'es-MX',
      market: 'mx',
    })
    queries.saveVariantCv(handle, id, {
      cv: sourceCv,
      report: { ...cleanReport },
      evidenceHash: 'h-source',
    })
    return id
  }

  it(
    'saves an English row with the same name, market, focus and evidence hash',
    withDb(async (handle) => {
      const sourceId = seedSource(handle)
      callStructuredMock
        .mockResolvedValueOnce(faithful())
        .mockResolvedValueOnce(supportedAll(ALL_LINES))
      const id = await translateAndSave(handle, { sourceId, profile, evidence })
      const saved = queries.getVariant(handle, id)
      expect(saved).toMatchObject({
        name: 'E-commerce',
        market: 'mx',
        language: 'en',
        focus: 'Marketplace growth',
        evidenceHash: 'h-source',
      })
      expect(saved?.report?.passed).toBe(true)
      expect(saved?.cv?.experience[0].bullets[0].text).toBe('Grew sales 40% on Amazon')
      // The translation is a paid call, named so its spend row says what it was.
      expect(callStructuredMock.mock.calls[0][0].stage).toBe('translate-cv')
      expect(JSON.stringify(callStructuredMock.mock.calls[0][0])).toContain('Target language: en')
    }),
  )

  it(
    'runs the same checks as any base CV: an invented figure is flagged',
    withDb(async (handle) => {
      const sourceId = seedSource(handle)
      const draft = faithful()
      draft.experience[0].bullets[0].text = 'Grew sales 45% on Amazon'
      callStructuredMock.mockResolvedValueOnce(draft).mockResolvedValueOnce(cleanVerdicts)
      const id = await translateAndSave(handle, { sourceId, profile, evidence })
      const report = queries.getVariant(handle, id)?.report
      expect(report?.unverifiedNumbers).toEqual([{ bulletId: 'b1', token: '45%' }])
      expect(report?.passed).toBe(false)
      // The distortion check ran on the lines the code checks left standing.
      const checked = JSON.stringify(callStructuredMock.mock.calls[1][0])
      expect(checked).toContain('Launched the Mercado Norte store')
      expect(checked).not.toContain('Grew sales 45%')
    }),
  )

  it(
    'a distortion the model check finds fails the report',
    withDb(async (handle) => {
      const sourceId = seedSource(handle)
      callStructuredMock.mockResolvedValueOnce(faithful()).mockResolvedValueOnce({
        verdicts: [
          { bulletId: 'title', supported: true, reason: '' },
          { bulletId: 'role-exp_1-title', supported: true, reason: '' },
          { bulletId: 'summary', supported: true, reason: '' },
          { bulletId: 'b1', supported: true, reason: '' },
          { bulletId: 'b2', supported: false, reason: 'overstated' },
        ],
      })
      const id = await translateAndSave(handle, { sourceId, profile, evidence })
      const report = queries.getVariant(handle, id)?.report
      expect(report?.distortions).toEqual([{ bulletId: 'b2', reason: 'overstated' }])
      expect(report?.passed).toBe(false)
    }),
  )

  it(
    'a dropped bullet saves nothing and reports translate-mismatch',
    withDb(async (handle) => {
      const sourceId = seedSource(handle)
      const draft = faithful()
      draft.experience[0].bullets.pop()
      callStructuredMock.mockResolvedValueOnce(draft)
      await expect(translateAndSave(handle, { sourceId, profile, evidence })).rejects.toMatchObject(
        { code: 'translate-mismatch' },
      )
      expect(queries.listVariants(handle)).toHaveLength(1)
      // No distortion check is paid for a translation that is thrown away.
      expect(callStructuredMock).toHaveBeenCalledTimes(1)
    }),
  )

  it(
    'an upgraded title is sent to the check against its source and fails the report',
    withDb(async (handle) => {
      const sourceId = seedSource(handle)
      const draft = faithful()
      draft.title = 'Director of Growth'
      draft.experience[0].title = 'Head of Growth'
      callStructuredMock.mockResolvedValueOnce(draft).mockResolvedValueOnce({
        verdicts: ALL_LINES.map((id) => ({
          bulletId: id,
          supported: !id.includes('title'),
          reason: id.includes('title') ? 'claims more seniority than "Growth Lead"' : '',
        })),
      })
      const id = await translateAndSave(handle, { sourceId, profile, evidence })
      const report = queries.getVariant(handle, id)?.report
      expect(report?.distortions.map((d) => d.bulletId)).toEqual(['title', 'role-exp_1-title'])
      expect(report?.passed).toBe(false)
      // Each title is judged against the title it was translated from.
      const checked = JSON.stringify(callStructuredMock.mock.calls[1][0])
      expect(checked).toContain('Director of Growth')
      expect(checked).toContain('translated from the title \\"Growth Lead\\"')
    }),
  )

  it(
    'replaces only the row it was given, after checking it is the other side',
    withDb(async (handle) => {
      const sourceId = seedSource(handle)
      // A composed (not translated) English side of the same pair.
      const target = queries.upsertVariantBrief(handle, {
        name: 'E-commerce',
        focus: 'Old English focus',
        language: 'en',
        market: 'mx',
      })
      callStructuredMock
        .mockResolvedValueOnce(faithful())
        .mockResolvedValueOnce(cleanVerdicts)
        .mockResolvedValueOnce(cleanVerdicts) // the retry of the lines left unanswered
        .mockResolvedValueOnce(faithful())
        .mockResolvedValueOnce(cleanVerdicts)
      const first = await translateAndSave(handle, {
        sourceId,
        targetId: target,
        profile,
        evidence,
      })
      const second = await translateAndSave(handle, {
        sourceId,
        targetId: target,
        profile,
        evidence,
      })
      expect([first, second]).toEqual([target, target])
      expect(queries.listVariants(handle)).toHaveLength(2)
      expect(queries.getVariant(handle, target)?.focus).toBe('Marketplace growth')
    }),
  )

  it(
    'refuses a target that is not the other side, before paying for anything',
    withDb(async (handle) => {
      const sourceId = seedSource(handle)
      const otherMarket = queries.upsertVariantBrief(handle, {
        name: 'E-commerce',
        focus: 'US',
        language: 'en',
        market: 'us-remote',
      })
      const sameLanguage = queries.upsertVariantBrief(handle, {
        name: 'E-commerce',
        focus: 'x',
        language: 'es-MX',
        market: 'mx',
      })
      for (const targetId of [otherMarket, sameLanguage, 'cvv_missing'])
        await expect(
          translateAndSave(handle, { sourceId, targetId, profile, evidence }),
        ).rejects.toMatchObject({ code: 'translate-target' })
      expect(callStructuredMock).not.toHaveBeenCalled()
    }),
  )

  it(
    'with no target, a new row — never the composed EN of another pair',
    withDb(async (handle) => {
      // ES#1 + EN are one pair; ES#2 (same name and market) stands alone.
      seedSource(handle)
      const en = queries.upsertVariantBrief(handle, {
        name: 'E-commerce',
        focus: 'composed English',
        language: 'en',
        market: 'mx',
      })
      queries.saveVariantCv(handle, en, {
        cv: { ...sourceCv, summary: 'Composed English summary.' },
        report: { ...cleanReport },
        evidenceHash: 'h-en',
      })
      const es2 = seedSource(handle)
      callStructuredMock.mockResolvedValueOnce(faithful()).mockResolvedValueOnce(cleanVerdicts)
      const id = await translateAndSave(handle, { sourceId: es2, profile, evidence })
      expect(id).not.toBe(en)
      expect(queries.listVariants(handle)).toHaveLength(4)
      expect(queries.getVariant(handle, en)?.cv?.summary).toBe('Composed English summary.')
      expect(queries.getVariant(handle, en)?.evidenceHash).toBe('h-en')
    }),
  )

  /** A source near two pages whose English runs ~40% longer: the pair must be cut. */
  function seedLong(handle: import('@/lib/db/client').Db) {
    const long =
      'Coordiné el catálogo, el pricing y la logística de la tienda en Mercado Norte con los equipos de operación'
    const bulletIds = Array.from({ length: 36 }, (_, i) => `b${i + 1}`)
    const longSource: CVContent = {
      ...sourceCv,
      experience: [
        {
          ...sourceCv.experience[0],
          bullets: bulletIds.map((id) => ({
            id,
            text: `${long} y las campañas de la categoría (${id}).`,
            citedEvidenceIds: ['ev_2'],
            keywordsUsed: [],
          })),
        },
      ],
    }
    const id = queries.upsertVariantBrief(handle, {
      name: 'E-commerce',
      focus: 'Marketplace growth',
      language: 'es-MX',
      market: 'mx',
    })
    queries.saveVariantCv(handle, id, {
      cv: longSource,
      // A verdict on a bullet the cut will remove: it must not outlive it.
      report: {
        ...cleanReport,
        distortions: [{ bulletId: 'b36', reason: 'stale' }],
        passed: false,
      },
      evidenceHash: 'h-source',
    })
    const composedAt = queries.getVariant(handle, id)?.composedAt
    // English that runs ~40% longer than its source, line for line; the
    // translation and the distortion check are queued here.
    const draft = {
      ...faithful(),
      experience: [
        {
          experienceId: 'exp_1',
          title: 'Growth Lead',
          location: 'Mexico City',
          bullets: bulletIds.map((b) => ({
            id: b,
            text: `Coordinated the catalogue, pricing and logistics of the Mercado Norte store together with the operations teams, the category campaigns and its weekly reporting, reviewed every week with the commercial team (${b}).`,
          })),
        },
      ],
    }
    expect(estimatePages(longSource)).toBeLessThanOrEqual(2)
    expect(estimatePages(mergeTranslation(longSource, draft))).toBeGreaterThan(2)
    callStructuredMock.mockResolvedValueOnce(draft).mockResolvedValueOnce(cleanVerdicts)

    return { id, bulletIds, composedAt }
  }

  it(
    'a translation over the limit is cut on both sides alike, and the source is re-checked',
    withDb(async (handle) => {
      const { id, bulletIds, composedAt } = seedLong(handle)
      const trimmed: number[] = []
      const enId = await translateAndSave(handle, {
        sourceId: id,
        profile,
        evidence,
        onTrimmedSource: (n) => trimmed.push(n),
      })
      const en = queries.getVariant(handle, enId)
      const es = queries.getVariant(handle, id)
      if (!en?.cv || !es?.cv) throw new Error('both sides saved')
      expect(estimatePages(en.cv)).toBeLessThanOrEqual(2)
      const ids = (cv: CVContent) => cv.experience[0].bullets.map((b) => b.id)
      expect(ids(en.cv).length).toBeLessThan(36)
      // The same bullets on both sides: the pair is one CV in two languages.
      expect(ids(es.cv)).toEqual(ids(en.cv))
      expect(ids(es.cv)).toEqual(bulletIds.slice(0, ids(es.cv).length))
      // The source's report describes the source as it now prints.
      expect(es.report?.distortions).toEqual([])
      expect(es.report?.passed).toBe(true)
      expect(es.evidenceHash).toBe('h-source')
      expect(es.composedAt).toBe(composedAt)
      // Only the translated lines left standing were sent to the model check.
      const checked = JSON.stringify(callStructuredMock.mock.calls[1][0])
      expect(checked).not.toContain('(b36)')
      // The caller is told the source was cut too, and by how much.
      expect(trimmed).toEqual([36 - ids(es.cv).length])
    }),
  )

  it(
    'the cut source and the translation are saved together, or neither is',
    withDb(async (handle) => {
      const { id } = seedLong(handle)
      const before = queries.getVariant(handle, id)
      failSave.on = true
      try {
        await expect(translateAndSave(handle, { sourceId: id, profile, evidence })).rejects.toThrow(
          'disk full',
        )
      } finally {
        failSave.on = false
      }
      expect(queries.getVariant(handle, id)).toEqual(before)
      expect(queries.listVariants(handle)).toHaveLength(1)
    }),
  )

  it(
    'a translation that fits leaves the source row untouched',
    withDb(async (handle) => {
      const sourceId = seedSource(handle)
      const before = queries.getVariant(handle, sourceId)
      callStructuredMock.mockResolvedValueOnce(faithful()).mockResolvedValueOnce(cleanVerdicts)
      await translateAndSave(handle, { sourceId, profile, evidence })
      expect(queries.getVariant(handle, sourceId)).toEqual(before)
    }),
  )

  it(
    'refuses a source with no composed CV',
    withDb(async (handle) => {
      const sourceId = queries.upsertVariantBrief(handle, {
        name: 'Empty',
        focus: 'x',
        language: 'en',
        market: 'mx',
      })
      await expect(translateAndSave(handle, { sourceId, profile, evidence })).rejects.toMatchObject(
        { code: 'variant-not-found' },
      )
      expect(callStructuredMock).not.toHaveBeenCalled()
    }),
  )
})

describe('pairVariants', () => {
  const row = (id: string, name: string, language: 'en' | 'es-MX', market = 'mx' as const) => ({
    id,
    name,
    focus: '',
    language,
    market,
    cv: null,
    report: null,
    evidenceHash: null,
    composedAt: null,
  })

  it('pairs rows by name and market, one per language', () => {
    const pairs = pairVariants([
      row('a', 'E-commerce', 'es-MX'),
      row('b', 'AI', 'en'),
      row('c', 'E-commerce', 'en'),
      row('d', 'E-commerce', 'en', 'us-remote' as 'mx'),
      row('e', 'E-commerce', 'es-MX'),
    ])
    expect(pairs.map((p) => [p['es-MX']?.id ?? null, p.en?.id ?? null])).toEqual([
      ['a', 'c'],
      [null, 'b'],
      [null, 'd'],
      // A second Spanish "E-commerce" has no partner left: it stands alone.
      ['e', null],
    ])
  })
})
