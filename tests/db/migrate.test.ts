import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDb, runMigrations } from '@/lib/db/client'
import { evidenceItems } from '@/lib/db/schema'

describe('migrations', () => {
  it('creates a usable schema on a fresh database and round-trips an evidence row', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
    const { db, close } = openDb(path.join(dir, 'test.db'))
    try {
      runMigrations(db)

      const row = {
        id: 'ev_1',
        kind: 'achievement' as const,
        sourceType: 'experience' as const,
        sourceId: 'exp_1',
        text: 'Cut checkout abandonment by 18% at Tiendamax',
        metrics: [{ raw: 'cut abandonment 18%', value: 18, unit: '%', direction: 'down' as const }],
        tags: ['ecommerce', 'conversion'],
        periodStart: '2016-01',
        periodEnd: '2018-06',
        strength: 'core' as const,
      }
      db.insert(evidenceItems).values(row).run()

      const back = db.select().from(evidenceItems).all()
      expect(back).toHaveLength(1)
      expect(back[0].metrics[0].unit).toBe('%')
      expect(back[0].tags).toEqual(['ecommerce', 'conversion'])
    } finally {
      close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is idempotent — running migrations twice does not throw', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
    const { db, close } = openDb(path.join(dir, 'test.db'))
    try {
      runMigrations(db)
      expect(() => runMigrations(db)).not.toThrow()
    } finally {
      close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
