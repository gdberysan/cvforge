import { describe, expect, it } from 'vitest'
import { chaseFind } from '@/lib/agent/chase'
import { getApplication, listApplications } from '@/lib/db/queries/applications'
import { listDismissedJobIds } from '@/lib/db/queries/discover'
import { find, withDb } from './fixtures'

describe('chaseFind', () => {
  it(
    'creates the application from the stored analysis',
    withDb((db) => {
      const out = chaseFind(db, '4460829599', find())
      expect(out.kind).toBe('created')
      if (out.kind === 'repost') return
      const app = getApplication(db, out.applicationId)
      expect(app?.jobTitle).toBe('Growth Marketing Manager')
      expect(app?.sourceUrl).toBe('https://www.linkedin.com/jobs/view/4460829599/?trk=x')
      expect(app?.coverage.verdict).toBe('strong')
    }),
  )

  it(
    'a second chase of the same posting reuses the application (Telegram and the app, or a double tap)',
    withDb((db) => {
      const first = chaseFind(db, '4460829599', find())
      // Same posting, LinkedIn's tracking query differs.
      const second = chaseFind(
        db,
        '4460829599',
        find({ sourceUrl: 'https://www.linkedin.com/jobs/view/4460829599' }),
      )
      expect(second.kind).toBe('existing')
      if (first.kind === 'repost' || second.kind === 'repost') return
      expect(second.applicationId).toBe(first.applicationId)
      expect(listApplications(db)).toHaveLength(1)
    }),
  )

  it(
    'a repost (same text, new job id) is dismissed, never a second application',
    withDb((db) => {
      const first = chaseFind(db, '4460829599', find())
      const out = chaseFind(
        db,
        '4470000001',
        find({ sourceUrl: 'https://www.linkedin.com/jobs/view/4470000001/' }),
      )
      expect(out.kind).toBe('repost')
      if (out.kind !== 'repost' || first.kind === 'repost') return
      expect(out.existingId).toBe(first.applicationId)
      expect(listDismissedJobIds(db)).toContain('4470000001')
      expect(listApplications(db)).toHaveLength(1)
    }),
  )
})
