// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvidenceEditor } from '@/components/evidence/EvidenceEditor'
import { EVIDENCE_FILTER_EVENT } from '@/components/evidence/ShowEvidenceButton'
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
  summaryCitedEvidenceIds: [],
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

describe('Experiencia: the jobs are the index', () => {
  const evidence = [
    rec('ev_complete', 'exp_done'),
    rec('ev_no_number', 'exp_todo', { metrics: [], text: 'Shipped a thing' }),
  ]

  it('opens the newest job; one only missing numbers stays a line that says so', () => {
    render(<EvidenceEditor profile={profile} evidence={evidence} />)
    expect(screen.getByRole('button', { name: /Finished Co/ }).getAttribute('aria-expanded')).toBe(
      'true',
    )
    expect(
      screen.getByRole('button', { name: /Unfinished Co/ }).getAttribute('aria-expanded'),
    ).toBe('false')
    expect(screen.getByText('1 without a number')).toBeTruthy()
  })

  it('a job with nothing usable yet starts open, its one move inside', () => {
    const stubs = [
      rec('ev_complete', 'exp_done'),
      rec('ev_stub', 'exp_todo', { origin: 'import', metrics: [], text: 'From the CV' }),
    ]
    render(<EvidenceEditor profile={profile} evidence={stubs} />)
    expect(
      screen.getByRole('button', { name: /Unfinished Co/ }).getAttribute('aria-expanded'),
    ).toBe('true')
  })

  it('tapping a job opens and closes it', () => {
    render(<EvidenceEditor profile={profile} evidence={evidence} />)
    const job = screen.getByRole('button', { name: /Unfinished Co/ })
    fireEvent.click(job)
    expect(job.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(job)
    expect(job.getAttribute('aria-expanded')).toBe('false')
  })

  it('"Without a number" shows only those records, and hides jobs with none', () => {
    render(<EvidenceEditor profile={profile} evidence={evidence} />)
    act(() => {
      window.dispatchEvent(new CustomEvent(EVIDENCE_FILTER_EVENT, { detail: 'unquantified' }))
    })
    expect(screen.queryByText('Finished Co')).toBeNull()
    expect(screen.getByText('Shipped a thing')).toBeTruthy()
    expect(screen.queryByDisplayValue('ev_complete')).toBeNull()
  })

  it('editing a job swaps its line for the form, and back', () => {
    render(<EvidenceEditor profile={profile} evidence={evidence} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit job' })[0])
    expect(screen.getByDisplayValue('Finished Co')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByDisplayValue('Finished Co')).toBeNull()
  })
})
