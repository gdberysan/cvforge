// tests/verdict-sentence.test.ts
import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@/lib/i18n'
import type { Coverage, EvidenceMapping, Requirement } from '@/lib/schemas'
import { verdictSentence } from '@/lib/verdict-sentence'

const req = (
  id: string,
  keyword: string,
  mandatory = true,
  kind: Requirement['kind'] = 'hard',
): Requirement => ({
  id,
  text: keyword,
  keyword,
  variants: [],
  kind,
  mandatory,
  weight: 2,
})
const map = (
  requirementId: string,
  strength: EvidenceMapping['strength'],
  unjudged?: boolean,
): EvidenceMapping => ({
  requirementId,
  evidenceIds: [],
  strength,
  rationale: '',
  ...(unjudged ? { unjudged } : {}),
})
const cov = (o: Partial<Coverage>): Coverage => ({
  mandatoryTotal: 0,
  mandatoryStrong: 0,
  mandatoryPartial: 0,
  mandatoryMissing: 0,
  desirableTotal: 0,
  desirableStrong: 0,
  desirablePartial: 0,
  desirableMissing: 0,
  hardBlockers: [],
  unjudgedGates: [],
  verdict: 'worth-it',
  ...o,
})
const es = makeTranslate('es')
const en = makeTranslate('en')

describe('verdictSentence', () => {
  it('names the count and the missing keywords verbatim', () => {
    const requirements = [
      req('a', 'Amazon Ads'),
      req('b', 'Bulksheets'),
      req('c', 'prueba práctica'),
    ]
    const mappings = [map('a', 'strong'), map('b', 'none')]
    const s = verdictSentence(es, 'es', {
      coverage: cov({ mandatoryTotal: 3, mandatoryStrong: 1, mandatoryMissing: 2 }),
      requirements,
      mappings,
    })
    expect(s).toBe(
      'Cubres de lleno 1 de 3 requisitos obligatorios. Te faltan Bulksheets y prueba práctica.',
    )
  })
  it('uses the singular for one missing, in English', () => {
    const s = verdictSentence(en, 'en', {
      coverage: cov({ mandatoryTotal: 2, mandatoryStrong: 1, mandatoryMissing: 1 }),
      requirements: [req('a', 'SQL'), req('b', 'Looker')],
      mappings: [map('a', 'strong'), map('b', 'none')],
    })
    expect(s).toBe('You fully cover 1 of 2 mandatory requirements. You are missing Looker.')
  })
  it('names at most three and counts the rest', () => {
    const requirements = ['A', 'B', 'C', 'D', 'E'].map((k) => req(k, k))
    const s = verdictSentence(es, 'es', {
      coverage: cov({ mandatoryTotal: 5, mandatoryMissing: 5 }),
      requirements,
      mappings: [],
    })
    expect(s).toBe('Cubres de lleno 0 de 5 requisitos obligatorios. Te faltan A, B, C y 2 más.')
  })
  it('says nothing is missing when nothing is', () => {
    const s = verdictSentence(es, 'es', {
      coverage: cov({ mandatoryTotal: 1, mandatoryStrong: 1, verdict: 'strong' }),
      requirements: [req('a', 'SQL')],
      mappings: [map('a', 'strong')],
    })
    expect(s).toBe('Cubres de lleno 1 de 1 requisitos obligatorios. No te falta ninguno.')
  })
  it('does not count an unjudged requirement as missing', () => {
    const s = verdictSentence(es, 'es', {
      coverage: cov({ mandatoryTotal: 2, mandatoryStrong: 1 }),
      requirements: [req('a', 'SQL'), req('b', 'CDMX', true, 'location')],
      mappings: [map('a', 'strong'), map('b', 'none', true)],
    })
    expect(s).toContain('No te falta ninguno')
  })
  it('names the blocker for skip', () => {
    const blocker = req('l', 'Residencia en Madrid', true, 'location')
    const s = verdictSentence(es, 'es', {
      coverage: cov({
        verdict: 'skip',
        hardBlockers: [blocker],
        mandatoryTotal: 1,
        mandatoryMissing: 1,
      }),
      requirements: [blocker],
      mappings: [],
    })
    expect(s).toBe('Pide Residencia en Madrid, algo que ningún CV puede cambiar.')
  })
  it('agrees the verb with two blockers', () => {
    const a = req('l', 'Residencia en Madrid', true, 'location')
    const b = req('w', 'Permiso de trabajo UE', true, 'authorization')
    expect(
      verdictSentence(es, 'es', {
        coverage: cov({
          verdict: 'skip',
          hardBlockers: [a, b],
          mandatoryTotal: 2,
          mandatoryMissing: 2,
        }),
        requirements: [a, b],
        mappings: [],
      }),
    ).toBe('Pide Residencia en Madrid y Permiso de trabajo UE, cosas que ningún CV puede cambiar.')
  })
  it('says nothing was extracted when there are no requirements', () => {
    expect(
      verdictSentence(es, 'es', {
        coverage: cov({ verdict: 'stretch' }),
        requirements: [],
        mappings: [],
      }),
    ).toBe('El análisis no encontró requisitos en esta vacante.')
  })
  it('falls back to desirable counts when nothing is mandatory', () => {
    const s = verdictSentence(es, 'es', {
      coverage: cov({ desirableTotal: 4, desirableStrong: 3 }),
      requirements: ['A', 'B', 'C', 'D'].map((k) => req(k, k, false)),
      mappings: [],
    })
    expect(s).toBe('La vacante no marca requisitos obligatorios. Cubres de lleno 3 de 4 deseables.')
  })
})
