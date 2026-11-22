import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { dismissJob, listDismissedJobIds, restoreJob } from '@/lib/db/queries/discover'

function withDb(fn: (db: Db) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
  const { db, close } = openDb(path.join(dir, 'test.db'))
  try {
    runMigrations(db)
    fn(db)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('dismissed jobs', () => {
  it('starts empty', () => {
    withDb((db) => {
      expect(listDismissedJobIds(db)).toEqual([])
    })
  })

  it('dismiss adds, restore removes', () => {
    withDb((db) => {
      dismissJob(db, '4300011451')
      dismissJob(db, '4300022562')
      expect(listDismissedJobIds(db).sort()).toEqual(['4300011451', '4300022562'])
      restoreJob(db, '4300011451')
      expect(listDismissedJobIds(db)).toEqual(['4300022562'])
    })
  })

  it('dismissing the same job twice is idempotent', () => {
    withDb((db) => {
      dismissJob(db, '4300011451')
      dismissJob(db, '4300011451')
      expect(listDismissedJobIds(db)).toEqual(['4300011451'])
    })
  })

  it('restoring an unknown id is a no-op', () => {
    withDb((db) => {
      restoreJob(db, '999999999')
      expect(listDismissedJobIds(db)).toEqual([])
    })
  })
})
