import { describe, expect, it } from 'vitest'
import { latestPrep, listAnswers, saveAnswer, savePrep } from '@/lib/db/queries/prep'
import { seedApp, withDb } from '../support/db-app'

const row = (applicationId: string, language: 'en' | 'es-MX', tag: string) => ({
  applicationId,
  outcomeEventId: null,
  language,
  content: { tag },
  report: { passed: true },
  evidenceHash: 'h',
})

describe('interview preps and his answers', () => {
  it('returns the newest prep per language', () => {
    withDb((db) => {
      const a = seedApp(db)
      savePrep(db, row(a, 'en', 'first'), Date.parse('2026-10-18T09:00:00Z'))
      savePrep(db, row(a, 'en', 'second'), Date.parse('2026-10-18T10:00:00Z'))
      savePrep(db, row(a, 'es-MX', 'spanish'), Date.parse('2026-10-18T11:00:00Z'))
      expect(latestPrep(db, a, 'en')?.content).toEqual({ tag: 'second' })
      expect(latestPrep(db, a, 'es-MX')?.content).toEqual({ tag: 'spanish' })
    })
  })

  it('keeps his answers apart from any prep', () => {
    withDb((db) => {
      const a = seedApp(db)
      savePrep(db, row(a, 'en', 'first'))
      const id = saveAnswer(db, {
        applicationId: a,
        evidenceIds: ['ev_1'],
        part: 'T',
        question: '¿Qué meta te pusieron?',
        answer: 'Bajar el CPA a 120',
      })
      savePrep(db, row(a, 'en', 'regenerated'))
      expect(listAnswers(db, a)).toEqual([
        expect.objectContaining({
          id,
          part: 'T',
          answer: 'Bajar el CPA a 120',
          evidenceIds: ['ev_1'],
        }),
      ])
    })
  })
})
