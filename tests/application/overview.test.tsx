// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
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

const POSTING = `About Pinecrest Studio
Pinecrest Studio is a conversion rate optimization agency for high-growth DTC brands, distributed across LATAM and beyond.
The Role
As an Account Strategist, you'll own growth and conversion strategy for a portfolio of DTC e-commerce brands.`

const coverage = {
  mandatoryTotal: 11,
  mandatoryStrong: 8,
  mandatoryPartial: 1,
  mandatoryMissing: 2,
  desirableTotal: 0,
  desirableStrong: 0,
  desirablePartial: 0,
  desirableMissing: 0,
  hardBlockers: [],
  unjudgedGates: [],
  verdict: 'worth-it' as const,
}

let dir = ''
let close = () => {}
beforeEach(async () => {
  const { openDb, runMigrations } = await import('@/lib/db/client')
  dir = mkdtempSync(path.join(tmpdir(), 'overview-'))
  const opened = openDb(path.join(dir, 'cv.db'))
  runMigrations(opened.db)
  holder.db = opened.db
  close = () => opened.close()
})
afterEach(() => {
  cleanup()
  close()
  rmSync(dir, { recursive: true, force: true })
})

async function renderPage(postingRaw: string, step?: string) {
  const { createApplication, appendOutcome } = await import('@/lib/db/queries/applications')
  const { LocaleProvider } = await import('@/components/i18n/LocaleProvider')
  const id = createApplication(holder.db as never, {
    source: 'linkedin',
    company: 'Pinecrest Studio',
    jobTitle: 'Account Strategist',
    market: 'mx',
    documentLanguage: 'en',
    postingRaw,
    postingHash: 'h',
    evidenceHash: 'e',
    requirements: [],
    mappings: [],
    coverage,
  })
  appendOutcome(holder.db as never, id, { at: new Date().toISOString(), type: 'applied' })
  const { default: Page } = await import('@/app/(app)/application/[id]/page')
  const ui = await Page({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(step ? { step } : {}),
  })
  render(<LocaleProvider locale="es">{ui}</LocaleProvider>)
  return id
}

describe('application overview', () => {
  it('opens as one story that leads with the answer', async () => {
    await renderPage(POSTING)
    expect(screen.getByRole('heading', { level: 1, name: 'Account Strategist' })).toBeTruthy()
    // One fact line ending in "Ver vacante": the "·" is drawn by CSS, so the
    // items are separate and none is a stray dot.
    const items = Array.from(document.querySelectorAll('.story-head .app-meta-item')).map(
      (el) => el.textContent,
    )
    expect(items.slice(0, 3)).toEqual(['Pinecrest Studio', 'México', 'CV en inglés'])
    expect(items[3]).toMatch('Ver vacante')
    expect(items).toHaveLength(4)
    expect(screen.getByText('Vale la pena')).toBeTruthy()
    // The posting's own words on the role, not the company section above it.
    expect(screen.getByRole('heading', { name: 'De qué trata el puesto' })).toBeTruthy()
    expect(screen.getByText(/^As an Account Strategist/)).toBeTruthy()
    // Sent: what happened next is on the same page, and the decision is gone.
    expect(screen.getByRole('heading', { level: 2, name: 'Qué sigue' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Hacer mi CV para esta vacante' })).toBeNull()
    // No tabs: the six-step bar is gone.
    expect(screen.queryByRole('navigation', { name: 'Pasos de esta postulación' })).toBeNull()
    // Nothing stores a salary, so no salary line is drawn.
    expect(screen.queryByText(/salario|salary/i)).toBeNull()
  })

  it('leaves the summary out when no paragraph qualifies — never padded', async () => {
    await renderPage('Remote\nFull time\n- Meta Ads\n- Shopify')
    expect(screen.queryByRole('heading', { name: 'De qué trata el puesto' })).toBeNull()
  })

  it('a named part is a place to scroll to, never a page that hides the rest', async () => {
    await renderPage(POSTING, 'decide')
    expect(document.getElementById('s-decide')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Qué sigue' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hoy' }).getAttribute('href')).toBe('/')
  })

  it('the gaps page with nothing to fill still lands on the current step, by name', async () => {
    const { saveProfile } = await import('@/lib/db/queries/profile')
    saveProfile(
      holder.db as never,
      {
        basics: {
          fullName: 'Dana',
          headline: '',
          email: '',
          location: '',
          timezone: 'UTC',
          links: [],
        },
        summary: '',
        summaryCitedEvidenceIds: [],
        experience: [],
        education: [],
        skills: [],
        languages: [],
        certifications: [],
        projects: [],
        workAuthorization: [],
        preferences: { targetTitles: [], markets: [] },
        updatedAt: '2026-08-09T00:00:00.000Z',
      } as never,
    )
    const id = await renderPage(POSTING)
    cleanup()
    const { default: GapsPage } = await import('@/app/(app)/application/[id]/gaps/page')
    // Sent, so its step is follow-up — not the overview a bare link opens.
    await expect(GapsPage({ params: Promise.resolve({ id }) })).rejects.toThrow(
      `redirect:/application/${id}?step=track`,
    )
  })
})
