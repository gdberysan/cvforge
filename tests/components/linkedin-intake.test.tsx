// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const readLinkedInPostingAction = vi.fn()
vi.mock('@/app/(app)/share/actions', () => ({ readLinkedInPostingAction }))
vi.mock('@/components/triage/TriageConsole', () => ({
  TriageConsole: (p: { initialText?: string }) => <pre data-testid="console">{p.initialText}</pre>,
}))

const { LinkedInIntake } = await import('@/components/triage/LinkedInIntake')

afterEach(() => {
  cleanup()
  readLinkedInPostingAction.mockReset()
})

describe('LinkedInIntake', () => {
  it('shows a reading line, calls the action once, then fills the box', async () => {
    readLinkedInPostingAction.mockResolvedValue({ status: 'ok', text: 'Growth Lead', market: 'mx' })
    render(<LinkedInIntake jobId="4012345678" fallbackMarket="mx" />)
    expect(screen.getByRole('status').textContent).toMatch(/LinkedIn/)
    expect((await screen.findByTestId('console')).textContent).toBe('Growth Lead')
    expect(readLinkedInPostingAction).toHaveBeenCalledOnce()
    expect(readLinkedInPostingAction).toHaveBeenCalledWith('4012345678')
  })

  it('a failed read leaves the paste box with a note', async () => {
    readLinkedInPostingAction.mockResolvedValue({ status: 'failed' })
    render(<LinkedInIntake jobId="4012345678" fallbackMarket="mx" />)
    expect((await screen.findByTestId('console')).textContent).toBe('')
    expect(screen.getByRole('status')).toBeTruthy()
  })
})
