import { describe, expect, it } from 'vitest'
import { buildEntityIndex, buildEvidenceProjection, citableIds } from '@/lib/ai/projection'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'

const profile: MasterProfile = {
  basics: {
    fullName: 'Dana Sofía Pérez Ruiz',
    headline: 'Full-stack engineer',
    email: 'secret@example.com',
    phone: '+52 55 0000 0000',
    location: 'Ciudad de México',
    timezone: 'America/Mexico_City',
    links: [{ label: 'korven.dev', url: 'https://korven.dev' }],
  },
  summary: 'Twelve years of ecommerce and automation.',
  experience: [
    {
      id: 'exp_1',
      title: 'Engineer',
      company: 'Tiendamax',
      period: { start: '2016-01', end: '2018-06' },
      summary: '',
    },
  ],
  education: [],
  skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [{ country: 'MX', status: 'citizen' }],
  preferences: { targetTitles: ['Senior Engineer'], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

function ev(id: string, text: string): EvidenceItem {
  return {
    id,
    kind: 'achievement',
    sourceRef: { type: 'experience', id: 'exp_1' },
    text,
    metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%', direction: 'down' }],
    tags: ['ecommerce'],
    period: { start: '2016-01' },
    strength: 'core',
    origin: 'manual',
  }
}

describe('buildEvidenceProjection', () => {
  it('is byte-stable regardless of input array order', () => {
    const a = buildEvidenceProjection(profile, [ev('ev_b', 'second'), ev('ev_a', 'first')])
    const b = buildEvidenceProjection(profile, [ev('ev_a', 'first'), ev('ev_b', 'second')])
    expect(a).toBe(b)
  })

  it('omits contact details, which must never sit in the cached prefix', () => {
    const text = buildEvidenceProjection(profile, [ev('ev_a', 'x')])
    expect(text).not.toContain('secret@example.com')
    expect(text).not.toContain('+52 55 0000 0000')
    expect(text).not.toContain('korven.dev')
  })

  it('includes every evidence id, its tags, and its metrics', () => {
    const text = buildEvidenceProjection(profile, [ev('ev_a', 'Rebuilt checkout')])
    expect(text).toContain('ev_a')
    expect(text).toContain('ecommerce')
    expect(text).toContain('cut abandonment 18%')
  })

  it('includes role titles, companies, location and work authorization', () => {
    const text = buildEvidenceProjection(profile, [ev('ev_a', 'x')])
    expect(text).toContain('Tiendamax')
    expect(text).toContain('Engineer')
    expect(text).toContain('America/Mexico_City')
    expect(text).toContain('MX:citizen')
  })
})

describe('buildEntityIndex', () => {
  it('indexes companies, skills, and target titles, lowercased', () => {
    const index = buildEntityIndex(profile, [ev('ev_a', 'x')])
    expect(index.has('tiendamax')).toBe(true)
    expect(index.has('typescript')).toBe(true)
    expect(index.has('python')).toBe(true)
  })

  it('indexes evidence tags', () => {
    expect(buildEntityIndex(profile, [ev('ev_a', 'x')]).has('ecommerce')).toBe(true)
  })
})

/**
 * Profile facts that are not evidence records — certifications, education,
 * languages — used to be invisible to the mapper (not in the projection) and
 * uncitable (no ids), so a posting requiring a certification the person holds
 * mapped to "none". They ride in a <credentials> block with citable ids.
 */
const credentialed: MasterProfile = {
  ...profile,
  education: [
    {
      id: 'edu_1',
      degree: 'Licenciatura en Administración',
      institution: 'Universidad Autónoma Metropolitana',
      period: { start: '2011-08', end: '2016-01' },
    },
  ],
  certifications: [
    {
      id: 'cert_2',
      name: 'HubSpot Marketing Software',
      issuer: 'HubSpot Academy',
      date: '2022-09',
    },
    { id: 'cert_1', name: 'Google Ads Search Certification', issuer: 'Google', date: '2024-02' },
  ],
  languages: [
    { language: 'Inglés', level: 'C1' },
    { language: 'Español', level: 'native' },
  ],
}

describe('credentials in the projection', () => {
  it('omits the issuer separator when the CV never printed an issuer', () => {
    // LinkedIn PDF exports print certification names with no issuer. A
    // dangling "— " told the mapper an issuer existed and was blank.
    const noIssuer = {
      ...credentialed,
      certifications: [{ id: 'cert_1', name: 'Apple Search Ads', issuer: '' }],
    }
    const text = buildEvidenceProjection(noIssuer, [ev('ev_a', 'x')])
    expect(text).toContain('cert_1 | certification | Apple Search Ads')
    expect(text).not.toContain('Apple Search Ads —')
  })

  it('lists certifications, education and languages with citable ids', () => {
    const text = buildEvidenceProjection(credentialed, [ev('ev_a', 'x')])
    expect(text).toContain('<credentials>')
    expect(text).toContain(
      'cert_1 | certification | Google Ads Search Certification — Google | 2024-02',
    )
    expect(text).toContain(
      'edu_1 | education | Licenciatura en Administración — Universidad Autónoma Metropolitana | 2011-08–2016-01',
    )
    expect(text).toContain('lang_ingles | language | Inglés — C1')
  })

  it('is byte-stable regardless of certification order', () => {
    const reversed = { ...credentialed, certifications: [...credentialed.certifications].reverse() }
    expect(buildEvidenceProjection(credentialed, [])).toBe(buildEvidenceProjection(reversed, []))
  })

  it('citableIds is evidence ids plus credential ids', () => {
    const ids = citableIds(credentialed, [ev('ev_a', 'x')])
    expect([...ids].sort()).toEqual([
      'cert_1',
      'cert_2',
      'edu_1',
      'ev_a',
      'lang_espanol',
      'lang_ingles',
    ])
  })

  it('colliding language slugs stay distinct and citable', () => {
    // "Inglés" and "ingles" both slug to lang_ingles — one id for two lines
    // means an ambiguous citation that findUnknownIds cannot catch.
    const colliding: MasterProfile = {
      ...credentialed,
      certifications: [],
      education: [],
      languages: [
        { language: 'Inglés', level: 'C1' },
        { language: 'ingles', level: 'B2' },
      ],
    }
    const ids = [...citableIds(colliding, [])].filter((id) => id.startsWith('lang_'))
    expect(new Set(ids).size).toBe(2)
    const text = buildEvidenceProjection(colliding, [])
    for (const id of ids) {
      expect(text).toContain(`${id} | language |`)
    }
  })

  it('a language that slugs to nothing still gets a real id', () => {
    // Non-Latin scripts strip to an empty slug; a bare "lang_" id collides
    // across every such language. Fall back to the position instead.
    const nonLatin: MasterProfile = {
      ...credentialed,
      certifications: [],
      education: [],
      languages: [
        { language: 'Español', level: 'native' },
        { language: '中文', level: 'B1' },
      ],
    }
    const ids = [...citableIds(nonLatin, [])].filter((id) => id.startsWith('lang_'))
    expect(ids.sort()).toEqual(['lang_2', 'lang_espanol'])
    expect(buildEvidenceProjection(nonLatin, [])).toContain('lang_2 | language | 中文 — B1')
  })

  it('a profile with no credentials omits the block, keeping pre-credentials hashes valid', () => {
    // An empty <credentials> block would still change the projection bytes,
    // flipping every stored evidenceHash from before the block existed to
    // "stale" and re-running the paid mapping stage for nothing.
    const text = buildEvidenceProjection(profile, [])
    expect(text).not.toContain('<credentials>')
    expect(text.endsWith('</evidence>\n</career>')).toBe(true)
  })
})
describe('credential lines with partial education', () => {
  it('never prints a dangling dash for a degree-less entry', () => {
    const partial = {
      ...profile,
      education: [{ id: 'edu_1', degree: '', institution: 'UNAM', period: { start: '2010-01' } }],
    }
    const projection = buildEvidenceProjection(partial, [])
    expect(projection).toContain('edu_1 | education | UNAM |')
    expect(projection).not.toContain('—  |')
    expect(projection).not.toContain('|  —')
  })
})
