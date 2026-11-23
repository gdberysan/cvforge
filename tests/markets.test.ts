import { describe, expect, it } from 'vitest'
import { languageLine } from '@/lib/ai/stages/compose-companion'
import { languageRule } from '@/lib/ai/stages/compose-cv'
import { prepLanguageLine } from '@/lib/ai/stages/interview-prep'
import { targetRule } from '@/lib/ai/stages/translate-cv'
import { marketFromLocation } from '@/lib/discover/annotate'
import {
  documentSpanish,
  dollarSignCurrency,
  MarketSchema,
  marketLabel,
  marketRule,
  NEUTRAL_SPANISH,
  personalSpanish,
  spanishOf,
  withArticle,
} from '@/lib/markets'
import type { MasterProfile } from '@/lib/schemas'
import { must } from './support/must'

const mexican = must(spanishOf('mx'))
const profileIn = (markets: string[]) => ({ preferences: { markets } }) as unknown as MasterProfile

/**
 * The translation rule exactly as it stood before markets opened up
 * (v1.2.58), copied here rather than read from that git tag: the tag does
 * not exist in a fresh clone or a CI checkout.
 */
const TRANSLATE_V1_2_58 =
  'Target language: es-MX. Write natively in Mexican Spanish — Mexican vocabulary and register, NOT peninsular Spanish, and not English word order. VOICE: bullets in first person singular with the subject implied, in the preterite ("Gestioné…", "Implementé…", "Diseñé…", "Asesoré…"), exactly as CVForge composes Spanish CVs; never third person ("Gestionó", "Administró") and never the infinitive ("Gestionar"). The SUMMARY keeps the source\'s construction: a descriptive noun phrase stays one ("Especialista en … con experiencia en …"), a past action is preterite, and it never introduces a present-tense verb about past work ("Combino…", "Gestiono…") — the present reads as an ongoing claim about engagements that have ended.'

describe('a Mexican user’s prompts do not change', () => {
  it('compose CV', () => {
    expect(languageRule('es-MX', mexican)).toBe(
      'Target language: es-MX. Write natively in Mexican Spanish (es-MX) — not translated English, and NOT peninsular Spanish. Use Mexican vocabulary and register as a Mexican recruiter would expect.',
    )
    expect(languageRule('en', mexican)).toBe(
      'Target language: en. Write in English. Use the spelling variant given in the target parameters.',
    )
  })

  it('companion', () => {
    expect(
      languageLine({ language: 'es-MX', market: 'us-remote', profile: profileIn(['mx']) }),
    ).toBe(
      'Write natively in Mexican Spanish (es-MX) — not translated English, and NOT peninsular Spanish. Mexican vocabulary and register.',
    )
  })

  it('interview prep', () => {
    expect(prepLanguageLine('es-MX', mexican)).toBe(
      'Output language: natural Mexican Spanish (es-MX), the way a Mexican professional speaks in an interview. Not translated English, not peninsular Spanish.',
    )
  })

  it('translation: the whole rule, voice included', () => {
    expect(targetRule('es-MX', mexican)).toBe(TRANSLATE_V1_2_58)
  })

  it('market lines for the three markets that existed', () => {
    const lengths = { onePage: 'ONE', twoPages: 'TWO' }
    expect(marketRule('mx', lengths)).toBe('Target market: Mexico. TWO')
    expect(marketRule('us-remote', lengths)).toBe(
      'Target market: US remote. US spelling. Bias hard toward a single page: ONE',
    )
    expect(marketRule('eu-remote', lengths)).toBe('Target market: Europe remote. TWO')
  })
})

describe('markets beyond Mexico', () => {
  it('accepts any country and the remote markets, nothing else', () => {
    expect(MarketSchema.parse(' CO ')).toBe('co')
    expect(MarketSchema.parse('latam-remote')).toBe('latam-remote')
    expect(MarketSchema.safeParse('xx').success).toBe(false)
    expect(MarketSchema.safeParse('mars-remote').success).toBe(false)
  })

  it('names markets in the UI language', () => {
    expect(marketLabel('co', 'es')).toBe('Colombia')
    expect(marketLabel('es', 'en')).toBe('Spain')
    expect(marketLabel('us-remote', 'es')).toBe('EE. UU. remoto')
  })

  it('reads a bare "$" as the market’s own dollar-sign currency, else USD', () => {
    expect(dollarSignCurrency('mx')).toBe('MXN')
    expect(dollarSignCurrency('co')).toBe('COP')
    expect(dollarSignCurrency('es')).toBe('USD')
    expect(dollarSignCurrency('eu-remote')).toBe('USD')
  })

  it('writes a Spanish document in the market’s Spanish, else the person’s, else neutral', () => {
    expect(documentSpanish('co', ['mx']).name).toBe('Colombian Spanish')
    expect(documentSpanish('us-remote', ['co', 'us-remote']).name).toBe('Colombian Spanish')
    expect(documentSpanish('us-remote', ['us-remote'])).toBe(NEUTRAL_SPANISH)
    expect(personalSpanish([])).toBe(NEUTRAL_SPANISH)
    const spain = must(spanishOf('es'))
    expect(languageRule('es-MX', spain)).toBe(
      'Target language: es-ES. Write natively in peninsular Spanish (es-ES) — not translated English. Use Spanish vocabulary and register as a Spanish recruiter would expect.',
    )
    expect(prepLanguageLine('es-MX', must(spanishOf('ar')))).toContain('an Argentine professional')
    expect(withArticle('Uruguayan')).toBe('a Uruguayan')
  })

  it('sizes and spells by market', () => {
    const lengths = { onePage: 'ONE', twoPages: 'TWO' }
    expect(marketRule('co', lengths)).toBe('Target market: Colombia. TWO')
    expect(marketRule('us', lengths)).toBe(
      'Target market: United States. US spelling. Bias hard toward a single page: ONE',
    )
    expect(marketRule('gb', lengths)).toBe('Target market: United Kingdom. UK spelling. TWO')
  })

  it('guesses a market from a LinkedIn location', () => {
    const mine = ['mx', 'us-remote']
    expect(marketFromLocation('Ciudad de México, México', mine)).toBe('mx')
    expect(marketFromLocation('Mexico (Remote)', mine)).toBe('mx')
    expect(marketFromLocation('Bogotá, Distrito Capital, Colombia', mine)).toBe('co')
    expect(marketFromLocation('Atlanta, Georgia, United States', mine)).toBe('us')
    expect(marketFromLocation('United States (Remote)', mine)).toBe('us-remote')
    expect(marketFromLocation('Remote', ['co', 'eu-remote'])).toBe('eu-remote')
    // A US state is the US; a place that names no country falls back.
    expect(marketFromLocation('Indianapolis, Indiana', mine)).toBe('us')
    expect(marketFromLocation('Springfield', mine)).toBe('mx')
    expect(marketFromLocation(null, [])).toBe('us-remote')
  })
})

describe('marketNamedIn reads whole place names', () => {
  it('never reads a country inside a longer name, and knows the usual short forms', async () => {
    const { marketNamedIn } = await import('@/lib/markets')
    // Launch audit 2026-11-23: "New Mexico" read as Mexico, "USA" as nothing.
    expect(marketNamedIn('Albuquerque, New Mexico')).toBe('us')
    expect(marketNamedIn('Newark, New Jersey')).toBe('us')
    expect(marketNamedIn('Atlanta, Georgia')).toBe('us')
    expect(marketNamedIn('Austin, TX, USA')).toBe('us')
    expect(marketNamedIn('Remote - USA')).toBe('us-remote')
    expect(marketNamedIn('Miami, EE. UU.')).toBe('us')
    expect(marketNamedIn('London, UK')).toBe('gb')
    // Still the country where it is the country.
    expect(marketNamedIn('Ciudad de México, México')).toBe('mx')
    expect(marketNamedIn('CDMX')).toBe('mx')
    expect(marketNamedIn('Mexico (Remote)')).toBe('mx')
    // A word that only contains a name is not it.
    expect(marketNamedIn('Busan')).not.toBe('us')
  })
})
