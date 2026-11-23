// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { makeTranslate } from '@/lib/i18n'

const app = (id: string, status: string) => ({
  id,
  createdAt: '2026-10-01T00:00:00.000Z',
  company: 'Acme',
  jobTitle: `Role ${id}`,
  source: 'linkedin',
  status,
  verdict: 'worth-it',
  mandatoryStrong: 3,
  mandatoryTotal: 5,
  hasDocuments: false,
})
const rows = [app('a1', 'triaged'), app('a2', 'applied'), app('a3', 'applied'), app('a4', 'closed')]

vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/applications', () => ({
  listApplications: (_db: unknown, o?: { archived?: boolean }) =>
    o?.archived ? [app('s1', 'archived')] : rows,
  listFullApplications: () => [],
}))
vi.mock('@/lib/db/queries/profile', () => ({ getProfile: () => null }))
vi.mock('@/lib/demo/mode', () => ({ isDemo: () => false }))
vi.mock('@/lib/stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stats')>()),
  attentionApplications: () => [],
  toStatApp: (a: unknown) => a,
}))
vi.mock('@/lib/i18n/server', () => ({
  getTranslate: async () => ({ t: makeTranslate('es'), locale: 'es' }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(app)/pipeline/actions', () => ({
  logOutcomeAction: vi.fn(),
  undoOutcomeAction: vi.fn(),
}))
vi.mock('@/app/(app)/triage/actions', () => ({ skipApplicationAction: vi.fn() }))

const { default: PipelinePage } = await import('@/app/(app)/pipeline/page')
afterEach(cleanup)

async function renderPage(sp: Record<string, string> = {}) {
  const ui = await PipelinePage({ searchParams: Promise.resolve(sp) })
  render(<LocaleProvider locale="es">{ui}</LocaleProvider>)
}

describe('Postulaciones filters', () => {
  it('are one even row of links, each carrying its count', async () => {
    await renderPage()
    const nav = screen.getByRole('navigation', { name: 'Estado' })
    expect(nav.className).toContain('seg-links')
    const labels = within(nav)
      .getAllByRole('link')
      .map((l) => l.textContent)
    expect(labels).toEqual(['todas4', 'analizada1', 'postulada2', 'cerrada1'])
  })

  it('mark the active one and keep the search when switching', async () => {
    await renderPage({ status: 'applied', q: 'acme' })
    const nav = screen.getByRole('navigation', { name: 'Estado' })
    const active = within(nav).getByRole('link', { current: 'page' })
    expect(active.textContent).toBe('postulada2')
    for (const l of within(nav).getAllByRole('link'))
      expect(l.getAttribute('href')).toContain('q=acme')
  })

  it('search fills the width with its button inside, named for what it does', async () => {
    await renderPage()
    expect(screen.getByRole('searchbox').closest('.search-field')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filtrar' })).toBeTruthy()
  })

  it('the skipped postings are a quiet line under the filters', async () => {
    await renderPage()
    expect(
      screen.getByRole('link', { name: /1 descartada/ }).closest('.pipeline-skipped'),
    ).toBeTruthy()
  })
})
