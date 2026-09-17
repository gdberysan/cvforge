// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
      id: 'exp_1',
      title: 'Marketing Coordinator',
      company: 'Northwind Gaming',
      period: { start: '2024-03', end: '2025-10' },
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

describe('EvidenceEditor — interview history', () => {
  it('shows a past session collapsed, revealing the verbatim Q&A on expand', () => {
    render(
      <EvidenceEditor
        profile={profile}
        evidence={[]}
        interviewSessions={[
          {
            id: 'int_1',
            roleId: 'exp_1',
            createdAt: '2026-08-28T14:00:00.000Z',
            answers: [
              { question: 'What did you spend most of your time on?', answer: 'Search campaigns.' },
            ],
          },
        ]}
      />,
    )

    // Collapsed by default: the answer text is present in the DOM (native
    // <details>) but the question is what a reader sees in the closed summary.
    expect(screen.getByText('1 answered')).toBeTruthy()
    expect(screen.getByText('What did you spend most of your time on?')).toBeTruthy()
    expect(screen.getByText('Search campaigns.')).toBeTruthy()
  })

  it('shows nothing for a role with no interview sessions', () => {
    render(<EvidenceEditor profile={profile} evidence={[]} interviewSessions={[]} />)
    expect(screen.queryByText(/answered/)).toBeNull()
  })

  it("does not leak another role's session onto this one", () => {
    render(
      <EvidenceEditor
        profile={profile}
        evidence={[]}
        interviewSessions={[
          {
            id: 'int_1',
            roleId: 'exp_OTHER',
            createdAt: '2026-08-28T14:00:00.000Z',
            answers: [{ question: 'Unrelated question', answer: 'Unrelated answer' }],
          },
        ]}
      />,
    )
    expect(screen.queryByText('Unrelated question')).toBeNull()
  })
})
