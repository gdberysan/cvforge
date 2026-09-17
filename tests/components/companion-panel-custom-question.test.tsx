// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompanionPanel } from '@/components/studio/CompanionPanel'
import type { ScreeningSet } from '@/lib/schemas'

afterEach(cleanup)

// jsdom has no ResizeObserver; AutoTextarea (rendered for every screening
// answer field) needs one to mount at all.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const document: ScreeningSet = {
  answers: [
    {
      id: 'q1',
      question: 'Years of experience?',
      answer: 'Ten.',
      citedEvidenceIds: [],
      source: 'ai',
    },
  ],
}

describe('CompanionPanel screening — custom question', () => {
  it('adds a user-typed question and shows the generated answer', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            answer: {
              id: 'q_new1234',
              question: 'Describe your 3P/Seller Central experience.',
              answer: 'Grounded answer text.',
              citedEvidenceIds: [],
              source: 'user',
            },
            report: {
              uncitedBullets: [],
              invalidCitations: [],
              unverifiedNumbers: [],
              unknownEntities: [],
              distortions: [],
              claimedGaps: [],
              passed: true,
            },
          }),
      }),
    ) as unknown as typeof fetch

    render(
      <CompanionPanel
        kind="screening"
        applicationId="app_1"
        initialDocument={document}
        initialReport={null}
      />,
    )

    const input = screen.getByLabelText(/add your own question/i)
    fireEvent.change(input, {
      target: { value: 'Describe your 3P/Seller Central experience.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /answer this question/i }))

    await waitFor(() => expect(screen.getByDisplayValue('Grounded answer text.')).toBeTruthy())
  })
})
