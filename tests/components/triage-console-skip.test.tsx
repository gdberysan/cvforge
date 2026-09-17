// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { skipApplicationAction } from '@/app/(app)/triage/actions'
import { TriageConsole } from '@/components/triage/TriageConsole'
import type { Coverage } from '@/lib/schemas'

vi.mock('@/app/(app)/triage/actions', () => ({ skipApplicationAction: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const coverage: Coverage = {
  mandatoryTotal: 1,
  mandatoryStrong: 1,
  mandatoryPartial: 0,
  mandatoryMissing: 0,
  desirableTotal: 0,
  desirableStrong: 0,
  desirablePartial: 0,
  desirableMissing: 0,
  hardBlockers: [],
  verdict: 'strong',
}

/** The cached-hit JSON answer, the shortest path to a rendered verdict card. */
function respondWithVerdict() {
  return Promise.resolve({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () =>
      Promise.resolve({
        applicationId: 'app_1',
        cached: true,
        company: 'Tiendamax',
        jobTitle: 'Engineer',
        coverage,
        requirements: [],
        mappings: [],
      }),
  })
}

async function renderVerdict() {
  render(<TriageConsole initialText={'x'.repeat(120)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Analyse this posting' }))
  return await screen.findByRole('button', { name: 'Skip' })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(respondWithVerdict))
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TriageConsole skip', () => {
  it('a refused skip keeps the card and shows the refusal', async () => {
    // The action refuses without throwing — the demo guard's shape. Treating
    // it as success clears the card as if the row had been archived.
    vi.mocked(skipApplicationAction).mockResolvedValue({
      ok: false,
      error: 'Demo is read-only.',
      code: 'demo-read-only',
    })

    const skip = await renderVerdict()
    fireEvent.click(skip)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This is the demo')
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy()
  })

  it('a successful skip clears the card back to the paste box', async () => {
    vi.mocked(skipApplicationAction).mockResolvedValue({ ok: true })

    const skip = await renderVerdict()
    fireEvent.click(skip)

    await screen.findByRole('button', { name: 'Analyse this posting' })
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
