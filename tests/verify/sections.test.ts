import { describe, expect, it } from 'vitest'
import type { CVContent, EvidenceItem, MasterProfile } from '@/lib/schemas'
import {
  degreeSourceId,
  degreeSources,
  PROFILE_SKILLS_ID,
  profileSkillsLine,
  roleTitleSourceId,
  roleTitleSources,
  runDeterministicChecks,
  verifiableLines,
} from '@/lib/verify/checks'
import { roleTitleId } from '@/lib/verify/line-text'
import { extractCounts, extractYearSpans, numbersIn } from '@/lib/verify/quantities'
import { recordedYears } from '@/lib/verify/sections'

const profile: MasterProfile = {
  basics: {
    fullName: 'Ana',
    headline: 'Especialista en marketing digital',
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
      period: { start: '2016-01', end: '2018-12' },
      summary: '',
    },
  ],
  education: [
    {
      id: 'edu_1',
      degree: 'Licenciatura en Mercadotecnia',
      institution: 'UNAM',
      period: { start: '2010-08', end: '2014-06' },
    },
  ],
  skills: [{ category: 'Ads', items: ['Google Ads', 'Meta Ads'] }],
  languages: [{ language: 'Inglés', level: 'B2' }],
  certifications: [{ id: 'cert_1', name: 'Google Ads Search', issuer: 'Google' }],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: ['Performance Marketing Manager'], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

const evidence: EvidenceItem[] = [
  {
    id: 'ev_1',
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text: 'Gestioné tres cuentas de ecommerce y un equipo de 6 personas en Looker Studio',
    metrics: [{ raw: 'ROAS 18%', value: 18, unit: '%' }],
    tags: ['ecommerce'],
    period: { start: '2016-01', end: '2018-12' },
    strength: 'core',
    origin: 'manual',
  },
]

function cv(overrides: Partial<CVContent> = {}): CVContent {
  return {
    header: { fullName: 'Ana', title: 'Growth Lead', contactLines: [] },
    summary: '',
    summaryCitedEvidenceIds: [],
    experience: [],
    projects: [],
    education: [],
    skills: [],
    extras: [],
    ...overrides,
  }
}

function check(
  content: CVContent,
  extra: Partial<Parameters<typeof runDeterministicChecks>[0]> = {},
) {
  return runDeterministicChecks({
    cv: content,
    evidence,
    profile,
    selectedEvidenceIds: new Set(['ev_1']),
    ...extra,
  })
}

function bulletCv(text: string): CVContent {
  return cv({
    experience: [
      {
        experienceId: 'exp_1',
        title: 'Growth Lead',
        company: 'Tiendamax',
        startDate: '2016-01',
        endDate: '2018-12',
        bullets: [{ id: 'b1', text, citedEvidenceIds: ['ev_1'], keywordsUsed: [] }],
      },
    ],
  })
}

describe('the summary is checked like a bullet', () => {
  it('flags an uncited summary', () => {
    const report = check(cv({ summary: 'Marketer de crecimiento.' }))
    expect(report.uncitedBullets).toEqual(['summary'])
    expect(report.passed).toBe(false)
  })

  it('passes a cited summary, and may cite a credential', () => {
    const report = check(
      cv({
        summary: 'Licenciado por la UNAM con ROAS de 18% en ecommerce.',
        summaryCitedEvidenceIds: ['ev_1', 'edu_1'],
      }),
    )
    expect(report.invalidCitations).toEqual([])
    expect(report.unverifiedNumbers).toEqual([])
    expect(report.passed).toBe(true)
  })

  it('accepts a figure the cited record states in its text, not only in its metrics', () => {
    // 2026-11-19: "logística 100% automatizada" was flagged against a record
    // reading "un sistema 100% automatizado", and the repair round deleted it.
    const record = {
      ...evidence[0],
      text: 'La logística, a través de un sistema 100% automatizado',
    }
    const line = (text: string) =>
      runDeterministicChecks({
        cv: bulletCv(text),
        evidence: [record],
        profile,
        selectedEvidenceIds: new Set(['ev_1']),
      }).unverifiedNumbers
    expect(line('Operé una logística 100% automatizada')).toEqual([])
    // Exact, never a substring: 10% is not stated anywhere.
    expect(line('Operé una logística 10% automatizada')).toEqual([{ bulletId: 'b1', token: '10%' }])
  })

  it('flags an invented figure in the summary', () => {
    const report = check(
      cv({ summary: 'Subí el ROAS 45% en ecommerce.', summaryCitedEvidenceIds: ['ev_1'] }),
    )
    expect(report.unverifiedNumbers).toEqual([{ bulletId: 'summary', token: '45%' }])
  })

  it('holds a span of years to the career on record', () => {
    // 2016-01 to 2018-12 is three years of work.
    const honest = check(cv({ summary: '3 años en ecommerce.', summaryCitedEvidenceIds: ['ev_1'] }))
    expect(honest.unverifiedNumbers).toEqual([])
    const inflated = check(
      cv({ summary: 'Más de 10 años en ecommerce.', summaryCitedEvidenceIds: ['ev_1'] }),
    )
    expect(inflated.unverifiedNumbers).toEqual([{ bulletId: 'summary', token: '10' }])
  })

  it('flags a known gap claimed in the summary', () => {
    const report = check(
      cv({ summary: 'Experto en Kubernetes y ecommerce.', summaryCitedEvidenceIds: ['ev_1'] }),
      { knownGaps: new Map([['kubernetes', 'Kubernetes in production']]) },
    )
    expect(report.claimedGaps[0]).toMatchObject({ bulletId: 'summary', keyword: 'kubernetes' })
  })
})

describe('bare counts', () => {
  it('passes a count the cited evidence states, in digits or words', () => {
    expect(check(bulletCv('Lideré un equipo de 6 personas')).unverifiedNumbers).toEqual([])
    expect(check(bulletCv('Gestioné 3 cuentas de ecommerce')).unverifiedNumbers).toEqual([])
  })

  it('flags a count the evidence never states', () => {
    expect(check(bulletCv('Lideré un equipo de 12 personas')).unverifiedNumbers).toEqual([
      { bulletId: 'b1', token: '12' },
    ])
  })

  it('reads counts, not years, versions or product names', () => {
    expect(extractCounts('Migré GA4 en 2018 (2018-03) para B2B, 24/7, con +200 clientes')).toEqual([
      200,
    ])
    expect(extractCounts('Subió 40% y $1.2M con 1,200 pedidos')).toEqual([1200])
    expect(extractYearSpans('Más de 8 años; 5+ years')).toEqual([8, 5])
    expect([...numbersIn('una docena de tres')]).toEqual(expect.arrayContaining([1, 12, 3]))
  })

  it('measures years on record as a union of periods', () => {
    const years = recordedYears([
      { start: '2016-01', end: '2016-12' },
      { start: '2016-07', end: '2017-12' },
    ])
    expect(years).toBe(2)
  })
})

describe('title, skills, education and extras', () => {
  it('passes a CV built only from what is on file', () => {
    const report = check(
      cv({
        // A specialty headline: a recorded title and a term the evidence backs.
        header: { fullName: 'Ana', title: 'Growth Lead · SEO · Meta Ads', contactLines: [] },
        skills: [{ category: 'Ads', items: ['Google Ads / Meta Ads', 'Looker Studio', 'SEO'] }],
        education: [
          { degree: 'Licenciatura en Mercadotecnia', institution: 'UNAM', period: '2010 – 2014' },
        ],
        extras: [
          { heading: 'Certificaciones', lines: ['Google Ads Search — Google'] },
          { heading: 'Idiomas', lines: ['English — B2'] },
        ],
      }),
      { supportedTerms: new Set(['SEO']) },
    )
    expect(report.unsupportedClaims).toEqual([])
    expect(report.passed).toBe(true)
  })

  it('flags a header title that is nobody’s', () => {
    const report = check(
      cv({ header: { fullName: 'Ana', title: 'Senior Data Engineer', contactLines: [] } }),
    )
    expect(report.unsupportedClaims).toEqual([{ bulletId: 'title', text: 'Senior Data Engineer' }])
  })

  it('flags the posting’s title as the header: it reads as a job held', () => {
    // The title belongs in the summary, as the role sought (see compose-cv).
    const report = check(
      cv({ header: { fullName: 'Ana', title: 'Amazon Ads Strategist', contactLines: [] } }),
      // Even when the posting's wording is backed: a backed term is a skill
      // the person has, never a title they held.
      { soughtTitle: 'Amazon Ads Strategist', supportedTerms: new Set(['Amazon Ads Strategist']) },
    )
    expect(report.unsupportedClaims).toEqual([{ bulletId: 'title', text: 'Amazon Ads Strategist' }])
  })

  it('accepts the posting’s title as the header when the person has held it', () => {
    const report = check(
      cv({ header: { fullName: 'Ana', title: 'Growth Lead', contactLines: [] } }),
      { soughtTitle: 'Growth Lead' },
    )
    expect(report.unsupportedClaims).toEqual([])
  })

  it('flags a wished-for title as the header: a target is not experience', () => {
    const report = check(
      cv({
        header: { fullName: 'Ana', title: 'Performance Marketing Manager', contactLines: [] },
      }),
    )
    expect(report.unsupportedClaims).toEqual([
      { bulletId: 'title', text: 'Performance Marketing Manager' },
    ])
  })

  it('accepts a base CV headed by its focus: it names a kind of role, not a posting', () => {
    const report = check(
      cv({ header: { fullName: 'Ana', title: 'Amazon Ads Strategist', contactLines: [] } }),
      { targetTitle: 'Amazon Ads Strategist' },
    )
    expect(report.unsupportedClaims).toEqual([])
  })

  it('flags a gap listed as a skill in code, and sends every skill to the model', () => {
    const content = cv({
      skills: [{ category: 'Tech', items: ['Terraform', 'Kubernetes', 'English (C2)'] }],
      extras: [{ heading: 'Otros', lines: ['Google Ads Search', 'Disponibilidad para viajar'] }],
    })
    const report = check(content, {
      knownGaps: new Map([['kubernetes', 'Kubernetes in production']]),
    })
    expect(report.claimedGaps[0]).toMatchObject({ bulletId: 'skills', keyword: 'kubernetes' })
    // A paraphrase is not decidable in code; an inflated language level is.
    expect(report.unsupportedClaims).toEqual([{ bulletId: 'skills', text: 'English (C2)' }])

    const lines = verifiableLines(content, profile, ['ev_1'])
    const skills = lines.find((l) => l.id === 'skills')
    expect(skills?.text).toContain('Terraform')
    // A skill may stand on a certificate on file ("Apple Search Ads" from its cert).
    expect(skills?.citedEvidenceIds).toEqual([PROFILE_SKILLS_ID, 'cert_1', 'ev_1'])
    // The certification on file is checked in code; only the free text goes to the model.
    expect(lines.find((l) => l.id === 'extras')?.text).toBe('Otros: Disponibilidad para viajar')
  })

  it('sends a role title to the model only when it differs from the recorded one', () => {
    const role = (title: string) => ({
      experienceId: 'exp_1',
      title,
      company: 'Tiendamax',
      startDate: '2016-01',
      bullets: [],
    })
    // The recorded title, give or take case and spacing: nothing to judge.
    expect(
      verifiableLines(cv({ experience: [role(' growth  lead ')] }), profile, ['ev_1']).find(
        (l) => l.id === roleTitleId('exp_1'),
      ),
    ).toBeUndefined()
    // A translation or an inflation: judged against the record, and only it.
    const line = verifiableLines(cv({ experience: [role('Head of Growth')] }), profile, [
      'ev_1',
    ]).find((l) => l.id === roleTitleId('exp_1'))
    expect(line).toEqual({
      id: roleTitleId('exp_1'),
      text: 'Head of Growth',
      citedEvidenceIds: [roleTitleSourceId('exp_1')],
    })
    expect(new Map(roleTitleSources(profile)).get(roleTitleSourceId('exp_1'))).toContain(
      '"Growth Lead" at Tiendamax',
    )
  })

  it('names the skills list as its own source for the model', () => {
    expect(profileSkillsLine(profile)).toContain('Google Ads, Meta Ads')
  })

  it("carries the profile facts a CV's extras print, so they are not judged invented", () => {
    // Saved CVs flagged the person's own location and "English — C1".
    const line = profileSkillsLine(profile)
    expect(line).toContain('location: CDMX')
    expect(line).toContain('Inglés (B2)')
  })

  it('flags a degree not on file, and a year the degree does not have', () => {
    const report = check(
      cv({
        education: [
          { degree: 'MBA', institution: 'Harvard', period: '2015' },
          { degree: 'Licenciatura en Mercadotecnia', institution: 'UNAM', period: '2012 – 2016' },
        ],
      }),
    )
    expect(report.unsupportedClaims.map((c) => c.text)).toEqual([
      'MBA — Harvard',
      'Licenciatura en Mercadotecnia — UNAM',
    ])
  })

  it('flags a degree raised above the recorded level at the right school', () => {
    // 2026-11-19 audit: the school alone passed the entry, whatever degree it printed.
    const report = check(
      cv({
        education: [
          { degree: 'Maestría en Mercadotecnia', institution: 'UNAM', period: '2010 – 2014' },
        ],
      }),
    )
    expect(report.unsupportedClaims.map((c) => c.text)).toEqual([
      'Maestría en Mercadotecnia — UNAM',
    ])
  })

  it('sends a degree worded unlike the record to the model, against that record only', () => {
    const at = (degree: string) =>
      cv({ education: [{ degree, institution: 'UNAM', period: '2010 – 2014' }] })
    // The recorded wording: nothing to judge.
    expect(
      verifiableLines(at('Licenciatura en Mercadotecnia'), profile, []).find((l) =>
        l.id.startsWith('education'),
      ),
    ).toBeUndefined()
    // A translation (same level, so the code passes it): the model judges it.
    const translated = at('Bachelor’s degree in Marketing')
    expect(check(translated).unsupportedClaims).toEqual([])
    expect(verifiableLines(translated, profile, []).find((l) => l.id === 'education-0')).toEqual({
      id: 'education-0',
      text: 'Bachelor’s degree in Marketing — UNAM',
      citedEvidenceIds: [degreeSourceId('edu_1')],
    })
    expect(new Map(degreeSources(profile)).get(degreeSourceId('edu_1'))).toContain(
      '"Licenciatura en Mercadotecnia" at UNAM',
    )
  })

  it('flags a language level above the recorded one, and a language not on file', () => {
    const report = check(
      cv({ extras: [{ heading: 'Idiomas', lines: ['Inglés — C2', 'Francés — B1'] }] }),
    )
    expect(report.unsupportedClaims.map((c) => c.text)).toEqual(['Inglés — C2', 'Francés — B1'])
  })

  it('flags a figure in extras that no credential states', () => {
    const report = check(
      cv({ extras: [{ heading: 'Logros', lines: ['Google Ads Search, top 5%'] }] }),
    )
    expect(report.unverifiedNumbers).toEqual([{ bulletId: 'extras', token: '5%' }])
  })
})

describe('unknown entities', () => {
  it('ignores sentence-final periods, possessives and multipliers', () => {
    const report = check(
      bulletCv('Grew Mexico’s ecommerce with a ROAS of 8x at the end of the year.'),
    )
    const flagged = report.unknownEntities.map((e) => e.entity)
    expect(flagged).not.toContain('year.')
    expect(flagged).not.toContain('8x')
    expect(flagged).toContain('Mexico')
  })
})

describe('a line naming several languages judges each at its own level', () => {
  const bilingual: MasterProfile = {
    ...profile,
    languages: [
      { language: 'Inglés', level: 'C1' },
      { language: 'Español', level: 'native' },
    ],
  }
  const idiomas = (line: string, p: MasterProfile = bilingual) =>
    check(cv({ extras: [{ heading: 'Idiomas', lines: [line] }] }), {
      profile: p,
    }).unsupportedClaims.map((c) => c.text)

  it('passes a true two-language line in either order', () => {
    expect(idiomas('Español (nativo), Inglés (C1)')).toEqual([])
    expect(idiomas('Inglés (C1) · Español (nativo)')).toEqual([])
    expect(idiomas('Español nativo e inglés C1')).toEqual([])
  })

  it('flags the inflated one, whichever comes first', () => {
    const spanishFirst: MasterProfile = {
      ...profile,
      languages: [
        { language: 'Español', level: 'native' },
        { language: 'Inglés', level: 'B2' },
      ],
    }
    expect(idiomas('Español (nativo), Inglés (C2)', spanishFirst)).toEqual([
      'Español (nativo), Inglés (C2)',
    ])
  })

  it('flags a language not on file beside one that is', () => {
    expect(idiomas('Inglés (C1), Francés (B1)')).toEqual(['Inglés (C1), Francés (B1)'])
  })
})

describe('a credential line still sends its other claims to the model', () => {
  const sent = (line: string) =>
    verifiableLines(cv({ extras: [{ heading: 'Certificaciones', lines: [line] }] }), profile, [
      'ev_1',
    ]).filter((l) => l.id === 'extras')

  it('a bare credential is checked in code only', () => {
    expect(sent('Google Ads Search — Google')).toEqual([])
    expect(sent('Licenciatura en Mercadotecnia, UNAM')).toEqual([])
    expect(sent('Inglés — B2')).toEqual([])
  })

  it('a claim riding on a credential goes to the model', () => {
    expect(sent('Google Ads Search — usada para auditar cuentas Fortune 500')).toHaveLength(1)
  })
})

describe('sameJobTitle', () => {
  it('reads one title through case, accents, punctuation and the gender marker', async () => {
    const { sameJobTitle } = await import('@/lib/verify/sections')
    expect(
      sameJobTitle('Coordinador(a) de Marketing Digital', 'Coordinador de Marketing Digital'),
    ).toBe(true)
    expect(sameJobTitle('Gerente/a de Growth', 'gerente de growth')).toBe(true)
    expect(sameJobTitle('Analista de Datos', 'Análisis de Datos')).toBe(false)
    expect(sameJobTitle('Growth Lead', 'Head of Growth')).toBe(false)
    expect(sameJobTitle('', '')).toBe(false)
  })
})
