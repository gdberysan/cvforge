// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { upsertEvidenceAction } from '@/app/(app)/evidence/actions'
import { EvidenceEditor } from '@/components/evidence/EvidenceEditor'
import type { MasterProfile } from '@/lib/schemas'

vi.mock('@/app/(app)/evidence/actions', () => ({
  deleteEvidenceAction: vi.fn(),
  upsertEvidenceAction: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const profile: MasterProfile = {
  basics: {
    fullName: 'Dana Sofía Pérez Ruiz',
    headline: '',
    email: 'x@example.com',
    location: 'Ciudad de México',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  experience: [
    {
      id: 'exp_7',
      title: 'Operations Intern',
      company: 'Initech Pharma',
      period: { start: '2013-02', end: '2013-09' },
      summary: '',
    },
  ],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  workAuthorization: [],
  preferences: { targetTitles: [], markets: ['mx'] },
  updatedAt: '2026-08-09T00:00:00.000Z',
}

afterEach(cleanup)

describe('EvidenceEditor — manual add', () => {
  it('adds a blank editable record for a role with nothing on file, with no AI call', () => {
    render(<EvidenceEditor profile={profile} evidence={[]} />)
    expect(screen.queryByLabelText('What you did, in full')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '+ add a record yourself' }))

    const textarea = screen.getByLabelText('What you did, in full')
    expect(textarea).toBeTruthy()
    // Nothing persisted yet — a blank draft is not a record.
    expect(upsertEvidenceAction).not.toHaveBeenCalled()

    fireEvent.change(textarea, { target: { value: 'Ran payroll benchmarking for 300 employees.' } })
    expect(textarea).toHaveProperty('value', 'Ran payroll benchmarking for 300 employees.')
  })
})
