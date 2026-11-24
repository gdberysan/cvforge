// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TriageConsole } from '@/components/triage/TriageConsole'

vi.mock('@/app/(app)/triage/actions', () => ({ skipApplicationAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

afterEach(cleanup)

const fetchMock = vi.fn()

beforeEach(() => {
  // jsdom has neither; the console scrolls the verdict into view on arrival.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  Element.prototype.scrollIntoView = vi.fn()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () =>
      Promise.resolve({
        applicationId: 'app_1',
        cached: true,
        company: 'X',
        jobTitle: 'Y',
        coverage: { verdict: 'strong', hardBlockers: [] },
        requirements: [],
        mappings: [],
      }),
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const posting = 'x'.repeat(120)

function bodyOf() {
  // The analysis request, not the cost note's own read of /api/spend.
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/ai/triage'))
  return JSON.parse(call?.[1].body as string)
}

describe('TriageConsole posting URL', () => {
  it('sends the URL it was given, so the posting can be reopened later', async () => {
    render(<TriageConsole initialText={posting} />)
    fireEvent.change(screen.getByLabelText(/link to the posting/i), {
      target: { value: 'https://www.linkedin.com/jobs/view/42' },
    })
    fireEvent.click(screen.getByRole('button', { name: /analiz|analys/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(bodyOf().sourceUrl).toBe('https://www.linkedin.com/jobs/view/42')
  })

  it('infers the source from the host instead of asking for it twice', async () => {
    render(<TriageConsole initialText={posting} />)
    fireEvent.change(screen.getByLabelText(/link to the posting/i), {
      target: { value: 'https://www.occ.com.mx/empleo/oferta/1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /analiz|analys/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(bodyOf().source).toBe('occ')
  })

  it('omits the URL entirely when none was typed, rather than sending an empty string', async () => {
    // The route validates sourceUrl with z.string().url(), so '' would fail the
    // whole request — and a blank field must not cost a paste its analysis.
    render(<TriageConsole initialText={posting} />)
    fireEvent.click(screen.getByRole('button', { name: /analiz|analys/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(bodyOf().sourceUrl).toBeUndefined()
  })

  it('keeps a handed-in source when the URL came from discover', async () => {
    // /discover already knows the job is from LinkedIn; the inference must not
    // override what the caller stated.
    render(
      <TriageConsole
        initialText={posting}
        initialSource="linkedin"
        initialSourceUrl="https://www.linkedin.com/jobs/view/7"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /analiz|analys/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(bodyOf()).toMatchObject({
      source: 'linkedin',
      sourceUrl: 'https://www.linkedin.com/jobs/view/7',
    })
  })
})
