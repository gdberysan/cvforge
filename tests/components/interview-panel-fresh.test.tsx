// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InterviewPanel } from '@/components/evidence/InterviewPanel'
import type { EvidenceItem, Experience } from '@/lib/schemas'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const role: Experience = {
  id: 'exp_abc12345',
  title: 'Engineer',
  company: 'Tiendamax',
  period: { start: '2025-07' },
  summary: '',
}

const stub: EvidenceItem = {
  id: 'ev_1',
  kind: 'achievement',
  sourceRef: { type: 'experience', id: 'exp_abc12345' },
  text: 'Rebuilt checkout',
  metrics: [],
  tags: [],
  period: { start: '2025-07' },
  strength: 'core',
  origin: 'import',
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('InterviewPanel on a role with nothing on file', () => {
  it('says the role is saved and the interview is how evidence gets created', () => {
    // Landing here straight from "add a role" is disorienting without it:
    // nothing says the role persisted or that leaving loses nothing.
    render(<InterviewPanel role={role} stubs={[]} existingCount={0} />)
    expect(screen.getByText(/The role is saved/)).toBeTruthy()
  })

  it('stays quiet when the role already has records', () => {
    render(<InterviewPanel role={role} stubs={[stub]} existingCount={0} />)
    expect(screen.queryByText(/The role is saved/)).toBeNull()
  })
})

describe('InterviewPanel with a stale draft from a different role at the same id', () => {
  it("starts fresh instead of resuming the other role's questions", () => {
    window.localStorage.setItem(
      'cvforge.interview.exp_1',
      JSON.stringify({
        fingerprint: { locale: 'en', company: 'Globex.com', title: 'Support Coordinator' },
        draft: {
          questions: [
            {
              id: 'q1',
              targetStubId: null,
              question: 'About Globex?',
              why: '',
              probesFor: 'context',
            },
          ],
          answers: {},
        },
      }),
    )
    const northwindRole: Experience = {
      id: 'exp_1',
      title: 'Marketing Coordinator',
      company: 'Northwind Gaming',
      period: { start: '2024-03' },
      summary: '',
    }
    render(<InterviewPanel role={northwindRole} stubs={[]} existingCount={1} />)
    expect(screen.queryByText(/About Globex/)).toBeNull()
  })
})
