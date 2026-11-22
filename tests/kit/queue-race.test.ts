import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chaseFind } from '@/lib/agent/chase'
import { type Db, openDb, runMigrations } from '@/lib/db/client'
import { findByPostingHash, listApplications } from '@/lib/db/queries/applications'
import { kitJobs } from '@/lib/db/schema'
import { enqueueKit } from '@/lib/kit/queue'
import { find } from '../agent/fixtures'

// The cap is read between enqueueKit's open-kit check and its insert: the
// hook is where the other process's tap lands.
const race = vi.hoisted(() => ({ between: null as null | (() => void) }))
vi.mock('@/lib/settings', async (orig) => ({
  ...(await orig<typeof import('@/lib/settings')>()),
  kitDailyCap: () => {
    race.between?.()
    return 5
  },
}))

/**
 * Telegram's Perseguir runs in the satellite's process, the find card's in
 * the server's: two connections to one file. Each test lets the "other
 * process" (a second connection that never waits for a lock) tap between
 * this one's check and its write.
 */
let dir: string
let a: ReturnType<typeof openDb>
let b: ReturnType<typeof openDb>
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-race-'))
  const file = path.join(dir, 'test.db')
  a = openDb(file)
  runMigrations(a.db)
  b = openDb(file)
  b.db.$client.pragma('busy_timeout = 0')
})
afterEach(() => {
  race.between = null
  a.close()
  b.close()
  rmSync(dir, { recursive: true, force: true })
})

const attempt = (fn: () => unknown) => {
  try {
    fn()
  } catch {
    // Locked out: the other tap waits, then finds the first one's work.
  }
}

describe('a chase from Telegram and the app at the same instant', () => {
  it('creates one application', () => {
    chaseFind(a.db, '4460829599', find(), {
      findByHash: (db: Db, hash: string) => {
        const seen = findByPostingHash(db, hash)
        attempt(() => chaseFind(b.db, '4460829599', find()))
        return seen
      },
    })
    expect(listApplications(a.db)).toHaveLength(1)
  })

  it('queues one kit', () => {
    const out = chaseFind(a.db, '4460829599', find())
    if (out.kind === 'repost') throw new Error('fixture')
    race.between = () => {
      race.between = null
      attempt(() => enqueueKit(b.db, out.applicationId))
    }
    enqueueKit(a.db, out.applicationId)
    expect(a.db.select().from(kitJobs).all()).toHaveLength(1)
  })
})
