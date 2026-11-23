// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dictionary } from '@/lib/i18n/dictionary'
import { scanSource } from '../design/scan'

const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/db/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/client')>()),
  get db() {
    return holder.db
  },
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
}))
vi.mock('@/lib/i18n/server', async () => {
  const { makeTranslate } = await import('@/lib/i18n')
  return { getTranslate: async () => ({ t: makeTranslate('es'), locale: 'es' }) }
})
vi.mock('@/components/studio/Workspace', () => ({ Workspace: () => null }))
vi.mock('@/components/application/FocusOnStep', () => ({ FocusOnStep: () => null }))

afterEach(cleanup)

describe('Seguimiento wiring', () => {
  it('the application page lists the agent’s gmail: outcomes with Deshacer', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const path = await import('node:path')
    const { openDb, runMigrations } = await import('@/lib/db/client')
    const { appendOutcome, createApplication } = await import('@/lib/db/queries/applications')
    const { LocaleProvider } = await import('@/components/i18n/LocaleProvider')
    const dir = mkdtempSync(path.join(tmpdir(), 'wiring-'))
    const opened = openDb(path.join(dir, 'cv.db'))
    runMigrations(opened.db)
    holder.db = opened.db
    const id = createApplication(opened.db, {
      source: 'linkedin',
      company: 'Acme',
      jobTitle: 'Eng',
      market: 'us-remote',
      documentLanguage: 'en',
      postingRaw: 'x',
      postingHash: 'h',
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
        verdict: 'stretch',
      },
    })
    appendOutcome(opened.db, id, { at: '2026-10-01T00:00:00.000Z', type: 'applied' })
    appendOutcome(opened.db, id, {
      at: '2026-10-05T00:00:00.000Z',
      type: 'rejected',
      note: 'gmail:m1 «Seguimos con otros perfiles.»',
    })
    const { default: Page } = await import('@/app/(app)/application/[id]/page')
    const ui = await Page({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ step: 'track' }),
    })
    render(<LocaleProvider locale="es">{ui}</LocaleProvider>)
    // Even with the agent off, its event keeps its card, its mark and Undo.
    expect(screen.getByRole('heading', { name: 'Correo' })).toBeTruthy()
    expect(screen.getByText('1 correo')).toBeTruthy()
    expect(screen.getByText('«Seguimos con otros perfiles.»')).toBeTruthy()
    expect(screen.getByText('Agente')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy()
    // The user's own send is under Tú, once; the rejection is not.
    expect(screen.getByRole('heading', { name: 'Lo que registraste' })).toBeTruthy()
    expect(screen.getByText('la envié')).toBeTruthy()
    expect(screen.queryByText('Marcaste: rechazada')).toBeNull()
    // Closed by that rejection: nothing left to ask.
    expect(screen.queryByText('¿Qué pasó?')).toBeNull()
    opened.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads the satellite: sender line names the company, the aliases fold away', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const path = await import('node:path')
    const Database = (await import('better-sqlite3')).default
    const { openDb, runMigrations } = await import('@/lib/db/client')
    const { appendOutcome, createApplication } = await import('@/lib/db/queries/applications')
    const { LocaleProvider } = await import('@/components/i18n/LocaleProvider')
    const dir = mkdtempSync(path.join(tmpdir(), 'wiring-'))
    const opened = openDb(path.join(dir, 'cv.db'))
    runMigrations(opened.db)
    holder.db = opened.db
    const id = createApplication(opened.db, {
      source: 'linkedin',
      company: 'Acme',
      jobTitle: 'Eng',
      market: 'us-remote',
      documentLanguage: 'en',
      postingRaw: 'x',
      postingHash: 'h',
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
        verdict: 'stretch',
      },
    })
    appendOutcome(opened.db, id, { at: '2026-10-01T00:00:00.000Z', type: 'applied' })
    const sat = path.join(dir, 'sat.db')
    const s = new Database(sat)
    s.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE mail_seen (message_id TEXT PRIMARY KEY NOT NULL, at TEXT NOT NULL, from_addr TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', handled_as TEXT NOT NULL, application_id TEXT, claimed_at TEXT, kind TEXT NOT NULL DEFAULT '', event_at TEXT);`)
    s.prepare('INSERT INTO settings VALUES (?, ?)').run('gmail-state', '"connected"')
    s.prepare('INSERT INTO mail_seen VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)').run(
      'm9',
      '2026-10-03T18:00:00.000Z',
      'talent@acme.com',
      'Thanks for applying',
      'none',
      id,
      'acknowledged',
    )
    s.close()
    vi.stubEnv('CVFORGE_SATELLITE_DB_PATH', sat)
    try {
      const { default: Page } = await import('@/app/(app)/application/[id]/page')
      const ui = await Page({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({ step: 'track' }),
      })
      const { container } = render(<LocaleProvider locale="es">{ui}</LocaleProvider>)
      expect(screen.getByText('Thanks for applying')).toBeTruthy()
      expect(screen.getByText('Acme · acme.com')).toBeTruthy()
      expect(screen.queryByText('Agente')).toBeNull()
      expect(screen.getByText('¿Qué pasó?')).toBeTruthy()
      const details = container.querySelector('details.seg-details')
      expect(details?.hasAttribute('open')).toBe(false)
      expect(screen.getByText('Otros nombres de la empresa')).toBeTruthy()
    } finally {
      vi.unstubAllEnvs()
      opened.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('Task 8 strings and styles', () => {
  const mailKeys = Object.keys(dictionary.en).filter(
    (k) => k.startsWith('mail.') || k.startsWith('settings.agent.mail') || k === 'error.bad-date',
  )
  it('every new key exists, non-empty, in en and es', () => {
    expect(mailKeys.length).toBeGreaterThan(20)
    for (const k of mailKeys) {
      expect((dictionary.en as Record<string, string>)[k]?.trim(), `en ${k}`).toBeTruthy()
      expect((dictionary.es as Record<string, string>)[k]?.trim(), `es ${k}`).toBeTruthy()
    }
    expect(
      Object.keys(dictionary.es)
        .filter((k) => k.startsWith('mail.'))
        .sort(),
    ).toEqual(
      Object.keys(dictionary.en)
        .filter((k) => k.startsWith('mail.'))
        .sort(),
    )
  })
  it('the .mail-* CSS names no raw colour and no palette variable', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const start = css.indexOf('.mail-quote')
    expect(start).toBeGreaterThan(0)
    const found = scanSource('a.css', css.slice(start))
    expect(found['raw-colour']).toBeUndefined()
    expect(found['palette-var']).toBeUndefined()
  })
})
