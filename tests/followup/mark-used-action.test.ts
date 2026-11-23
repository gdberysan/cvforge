import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb, runMigrations } from '@/lib/db/client'
import { createApplication } from '@/lib/db/queries/applications'
import { latestDraft, saveDraft } from '@/lib/db/queries/drafts'

const holder = vi.hoisted(() => ({ db: null as unknown, demo: false }))
vi.mock('@/lib/db/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/client')>()),
  get db() {
    return holder.db
  },
}))
vi.mock('@/lib/demo/mode', async (orig) => ({
  ...(await orig<typeof import('@/lib/demo/mode')>()),
  isDemo: () => holder.demo,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { markDraftUsedAction } = await import('@/app/(app)/pipeline/actions')

let dir: string
let close: () => void
let appId: string
let otherApp: string
let draftId: string
let agentFile: string

const base = {
  source: 'linkedin' as const,
  company: 'Acme',
  jobTitle: 'Eng',
  market: 'us-remote' as const,
  documentLanguage: 'en' as const,
  postingRaw: 'x',
  evidenceHash: 'e',
  requirements: [],
  mappings: [],
  coverage: {
    mandatoryTotal: 0,
    mandatoryStrong: 0,
    mandatoryPartial: 0,
    mandatoryMissing: 0,
    desirableTotal: 0,
    desirableStrong: 0,
    desirablePartial: 0,
    desirableMissing: 0,
    hardBlockers: [],
    verdict: 'stretch' as const,
  },
}

function chaseRows(): { event: string; detail: string }[] {
  const db = new Database(agentFile, { readonly: true })
  try {
    return db.prepare("SELECT event, detail FROM run_log WHERE event = 'chase'").all() as {
      event: string
      detail: string
    }[]
  } finally {
    db.close()
  }
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cvforge-draft-'))
  const opened = openDb(path.join(dir, 'cv.db'))
  runMigrations(opened.db)
  holder.db = opened.db
  holder.demo = false
  close = opened.close
  appId = createApplication(opened.db, { ...base, postingHash: 'h1' })
  otherApp = createApplication(opened.db, { ...base, postingHash: 'h2' })
  draftId = saveDraft(opened.db, { applicationId: appId, to: '', subject: 's', body: 'b' })
  agentFile = path.join(dir, 'agent.db')
  const agent = new Database(agentFile)
  agent.exec('CREATE TABLE run_log (at TEXT, event TEXT, detail TEXT)')
  agent.close()
  process.env.CVFORGE_SATELLITE_DB_PATH = agentFile
})

afterEach(() => {
  close()
  rmSync(dir, { recursive: true, force: true })
  delete process.env.CVFORGE_SATELLITE_DB_PATH
})

describe('markDraftUsedAction', () => {
  it('marks the draft sent and records one chase for the weekly count', async () => {
    const out = await markDraftUsedAction(appId, draftId)
    expect(out.ok).toBe(true)
    const used = latestDraft(holder.db as never, appId)?.usedAt
    expect(used).toBeTruthy()
    expect(out).toEqual({ ok: true, usedAt: used })
    expect(chaseRows()).toEqual([{ event: 'chase', detail: `follow-up:${draftId}` }])
    // A second tap is not a second follow-up.
    await markDraftUsedAction(appId, draftId)
    expect(chaseRows()).toHaveLength(1)
    expect(latestDraft(holder.db as never, appId)?.usedAt).toBe(used)
  })

  it('without the agent, still marks the draft', async () => {
    process.env.CVFORGE_SATELLITE_DB_PATH = path.join(dir, 'missing.db')
    const out = await markDraftUsedAction(appId, draftId)
    expect(out.ok).toBe(true)
    expect(latestDraft(holder.db as never, appId)?.usedAt).toBeTruthy()
  })

  it("refuses another application's draft, and an unknown one", async () => {
    expect(await markDraftUsedAction(otherApp, draftId)).toMatchObject({
      ok: false,
      code: 'not-found',
    })
    expect(await markDraftUsedAction(appId, 'fud_nope')).toMatchObject({ ok: false })
    expect(latestDraft(holder.db as never, appId)?.usedAt).toBeNull()
    expect(chaseRows()).toEqual([])
  })

  it('refuses ids that are not non-empty strings', async () => {
    expect(await markDraftUsedAction('', draftId)).toMatchObject({ code: 'invalid-request' })
    expect(await markDraftUsedAction(appId, '')).toMatchObject({ code: 'invalid-request' })
    expect(await markDraftUsedAction(appId, { id: draftId } as unknown as string)).toMatchObject({
      code: 'invalid-request',
    })
    expect(latestDraft(holder.db as never, appId)?.usedAt).toBeNull()
  })

  it('is blocked in the demo', async () => {
    holder.demo = true
    expect((await markDraftUsedAction(appId, draftId)).ok).toBe(false)
    expect(latestDraft(holder.db as never, appId)?.usedAt).toBeNull()
  })
})
