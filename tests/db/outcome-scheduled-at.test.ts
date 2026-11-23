import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb, runMigrations } from '@/lib/db/client'
import {
  appendOutcome,
  createApplication,
  getApplication,
  listMailOutcomes,
  setScheduledAt,
} from '@/lib/db/queries/applications'

const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/db/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/client')>()),
  get db() {
    return holder.db
  },
}))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

let dir: string
let close: () => void
let file: string
let appA: string
let appB: string
let interviewId: string

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
    unjudgedGates: [],
    verdict: 'stretch' as const,
  },
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sched-'))
  file = path.join(dir, 'cv.db')
  const o = openDb(file)
  runMigrations(o.db)
  holder.db = o.db
  close = o.close
  appA = createApplication(o.db, { ...base, postingHash: 'a' })
  appB = createApplication(o.db, { ...base, postingHash: 'b' })
  interviewId = appendOutcome(o.db, appA, {
    at: '2026-10-10T00:00:00.000Z',
    type: 'interview',
    note: 'gmail:m1 «Te invitamos»',
    scheduledAt: '2026-10-20T15:00:00.000Z',
  })
  revalidatePath.mockClear()
})
afterEach(() => {
  close()
  delete process.env.CVFORGE_MODE
  rmSync(dir, { recursive: true, force: true })
})

describe('migration 0013 and the scheduledAt query surface', () => {
  it('adds a nullable text scheduled_at column', () => {
    const raw = new Database(file, { readonly: true })
    const col = (
      raw.prepare('PRAGMA table_info(outcome_events)').all() as {
        name: string
        type: string
        notnull: number
      }[]
    ).find((c) => c.name === 'scheduled_at')
    raw.close()
    expect({ ...col, type: col?.type.toLowerCase() }).toMatchObject({ type: 'text', notnull: 0 })
  })

  it('appendOutcome writes it; getApplication and listMailOutcomes return it', () => {
    const db = holder.db as never
    expect(getApplication(db, appA)?.outcomes.at(-1)).toMatchObject({
      type: 'interview',
      scheduledAt: '2026-10-20T15:00:00.000Z',
    })
    expect(listMailOutcomes(db, appA)[0]?.scheduledAt).toBe('2026-10-20T15:00:00.000Z')
  })

  it('an outcome without a time has no scheduledAt key, and null in the mail list', () => {
    const db = holder.db as never
    appendOutcome(db, appB, {
      at: '2026-10-11T00:00:00.000Z',
      type: 'applied',
      note: 'gmail:m2 «x»',
    })
    expect(getApplication(db, appB)?.outcomes[0]).not.toHaveProperty('scheduledAt')
    expect(listMailOutcomes(db, appB)[0]?.scheduledAt).toBeNull()
  })

  it('setScheduledAt sets, clears, and is scoped by both ids', () => {
    const db = holder.db as never
    expect(setScheduledAt(db, appA, interviewId, '2026-11-01')).toBe(true)
    expect(listMailOutcomes(db, appA)[0]?.scheduledAt).toBe('2026-11-01')
    expect(setScheduledAt(db, appA, interviewId, null)).toBe(true)
    expect(listMailOutcomes(db, appA)[0]?.scheduledAt).toBeNull()
    expect(setScheduledAt(db, appB, interviewId, '2026-11-01')).toBe(false)
    const applied = appendOutcome(db, appA, { at: '2026-10-09T00:00:00.000Z', type: 'applied' })
    expect(setScheduledAt(db, appA, applied, '2026-11-01')).toBe(false)
    const screen = appendOutcome(db, appA, { at: '2026-10-09T01:00:00.000Z', type: 'screen' })
    expect(setScheduledAt(db, appA, screen, '2026-11-01')).toBe(true)
    expect(setScheduledAt(db, appA, 'out_nope', '2026-11-01')).toBe(false)
    expect(listMailOutcomes(db, appA)[0]?.scheduledAt).toBeNull()
  })
})

describe('setInterviewTimeAction', () => {
  const act = () => import('@/app/(app)/pipeline/actions')

  it('accepts a date and a datetime, clears with null, revalidates', async () => {
    const { setInterviewTimeAction } = await act()
    const cases: [string, string][] = [
      ['2026-11-01', '2026-11-01'],
      ['2026-11-01T09:30:00.000Z', '2026-11-01T09:30:00.000Z'],
      ['2026-11-01T09:30Z', '2026-11-01T09:30:00.000Z'],
      ['2026-11-01T09:30:00+02:00', '2026-11-01T07:30:00.000Z'],
    ]
    for (const [v, stored] of cases) {
      expect(await setInterviewTimeAction(appA, interviewId, v)).toEqual({ ok: true })
      expect(listMailOutcomes(holder.db as never, appA)[0]?.scheduledAt).toBe(stored)
    }
    expect(revalidatePath).toHaveBeenCalledWith(`/application/${appA}`)
    expect(await setInterviewTimeAction(appA, interviewId, null)).toEqual({ ok: true })
    expect(listMailOutcomes(holder.db as never, appA)[0]?.scheduledAt).toBeNull()
  })

  it('rejects bad values and writes nothing', async () => {
    const { setInterviewTimeAction } = await act()
    for (const v of [
      '',
      'tomorrow',
      '2019-12-31',
      '2101-01-01',
      '2026-02-30',
      '2026-13-01',
      '2026-11-01T25:00Z',
      '2026-11-01T09:30',
      '2026-11-01T09:30:00',
      '11/01/2026',
    ]) {
      expect(await setInterviewTimeAction(appA, interviewId, v)).toMatchObject({
        ok: false,
        code: 'invalid-request',
      })
    }
    expect(listMailOutcomes(holder.db as never, appA)[0]?.scheduledAt).toBe(
      '2026-10-20T15:00:00.000Z',
    )
  })

  it('refuses outcomes that are not an interview or screen', async () => {
    const { setInterviewTimeAction } = await act()
    const applied = appendOutcome(holder.db as never, appA, {
      at: '2026-10-09T00:00:00.000Z',
      type: 'applied',
    })
    expect(await setInterviewTimeAction(appA, applied, '2026-11-01')).toMatchObject({
      ok: false,
      code: 'not-found',
    })
  })

  it("refuses another application's outcome, and the demo", async () => {
    const { setInterviewTimeAction } = await act()
    expect(await setInterviewTimeAction(appB, interviewId, '2026-11-01')).toMatchObject({
      ok: false,
      code: 'not-found',
    })
    process.env.CVFORGE_MODE = 'demo'
    expect(await setInterviewTimeAction(appA, interviewId, '2026-11-01')).toMatchObject({
      ok: false,
      code: 'demo-read-only',
    })
  })
})
