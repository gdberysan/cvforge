import { describe, expect, it } from 'vitest'
import { upsertEvidence } from '@/lib/db/queries/evidence'
import { upsertAgentPeople } from '@/lib/db/queries/people'
import { saveProfile } from '@/lib/db/queries/profile'
import { loadPrepInput } from '@/lib/prep/load'
import { seedApp, withDb } from '../support/db-app'
import { funnel, profile } from './fixtures'

describe('loadPrepInput', () => {
  it('is null for an unknown application or a missing profile', () => {
    withDb((db) => {
      const a = seedApp(db)
      expect(loadPrepInput(db, 'nope')).toBeNull()
      expect(loadPrepInput(db, a)).toBeNull()
    })
  })

  it('reads the application, profile, evidence, people and answers', () => {
    withDb((db) => {
      const a = seedApp(db)
      saveProfile(db, profile)
      upsertEvidence(db, funnel)
      upsertAgentPeople(db, a, null, [{ name: 'Ana', email: 'ana@x.com', source: 'invite' }])
      const input = loadPrepInput(db, a, 'es-MX')
      expect(input?.application.id).toBe(a)
      expect(input?.evidence.map((e) => e.id)).toEqual(['ev_funnel'])
      expect(input?.people.map((p) => p.name)).toEqual(['Ana'])
      expect(input?.language).toBe('es-MX')
    })
  })
})
