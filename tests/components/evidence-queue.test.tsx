// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvidenceEditor } from '@/components/evidence/EvidenceEditor'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'

vi.mock('@/app/(app)/evidence/actions', () => ({
  deleteEvidenceAction: vi.fn(),
  upsertEvidenceAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const role = (id: string, company: string) => ({
  id,
  title: 'Lead',
  company,
  period: { start: '2016-01', end: '2018-06' },
  summary: '',
})
const profile = {
  basics: {
    fullName: 'Dana',
    headline: '',
    email: '',
    location: '',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  experience: [role('exp_done', 'Finished Co'), role('exp_todo', 'Unfinished Co')],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
} as MasterProfile

const rec = (id: string, roleId: string, over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id,
  kind: 'achievement',
  sourceRef: { type: 'experience', id: roleId },
  text: id,
  metrics: [{ raw: '18%', value: 18, unit: '%' }],
  tags: ['x'],
  period: { start: '2016-01' },
  strength: 'core',
  origin: 'interview',
  ...over,
})

afterEach(cleanup)

describe('Experiencia as a work queue', () => {
  const evidence = [
    rec('ev_complete', 'exp_done'),
    rec('ev_no_number', 'exp_todo', { metrics: [], text: 'Shipped a thing' }),
  ]

  it('opens roles that need work and collapses finished ones', () => {
    render(<EvidenceEditor profile={profile} evidence={evidence} />)
    expect(
      screen.getByRole('button', { name: 'Expand Finished Co' }).getAttribute('aria-expanded'),
    ).toBe('false')
    expect(
      screen.getByRole('button', { name: 'Collapse Unfinished Co' }).getAttribute('aria-expanded'),
    ).toBe('true')
  })

  it('"Without a number" shows only those records, and hides roles with none', () => {
    render(<EvidenceEditor profile={profile} evidence={evidence} />)
    fireEvent.click(screen.getByRole('button', { name: /Without a number/ }))
    expect(screen.queryByText('Finished Co')).toBeNull()
    expect(screen.getByDisplayValue('Shipped a thing')).toBeTruthy()
    expect(screen.queryByDisplayValue('ev_complete')).toBeNull()
  })

  it('offers no filter with nothing behind it', () => {
    render(<EvidenceEditor profile={profile} evidence={evidence} />)
    expect(screen.queryByRole('button', { name: /Only your CV/ })).toBeNull()
  })
})
