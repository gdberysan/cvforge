// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GapSelection } from '@/lib/gaps/select'
import type { Experience, Requirement } from '@/lib/schemas'

const acceptMock = vi.fn()
const remapMock = vi.fn()
const pushMock = vi.fn()

vi.mock('@/app/(app)/application/[id]/gaps/actions', () => ({
  acceptGapEvidenceAction: acceptMock,
}))
vi.mock('@/lib/gaps/remap-request', () => ({ requestRemap: remapMock }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }))

// jsdom has no ResizeObserver; AutoTextarea (one per gap) needs one to mount.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const { GapFill } = await import('@/components/application/GapFill')

afterEach(cleanup)

const req = (id: string, keyword: string): Requirement => ({
  id,
  text: `${keyword} required`,
  keyword,
  variants: [],
  kind: 'hard',
  mandatory: true,
  weight: 2,
})

const roles: Experience[] = [
  {
    id: 'exp_1',
    title: 'Analyst',
    company: 'Alpha',
    period: { start: '2020-01', end: '2022-01' },
    summary: '',
  },
]

const selection: GapSelection = {
  primary: [
    {
      requirement: req('req_1', 'Salesforce'),
      rationale: 'Nothing in your evidence mentions Salesforce.',
      strength: 'none' as const,
    },
  ],
  secondary: [],
  blockers: [],
}

function renderPanel(over: Partial<typeof selection> = {}) {
  return render(
    <GapFill
      applicationId="app_1"
      selection={{ ...selection, ...over }}
      roles={roles}
      postingRaw="posting"
      market="mx"
    />,
  )
}

function fillFirstGap() {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I built two workflows.' } })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'exp_1' } })
}

beforeEach(() => {
  acceptMock.mockReset()
  remapMock.mockReset()
  pushMock.mockReset()
  acceptMock.mockResolvedValue({
    ok: true,
    before: { verdict: 'stretch', strengths: { req_1: 'none' } },
  })
  remapMock.mockResolvedValue(undefined)
  global.fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          evidence: [
            {
              id: 'ev_gap_1',
              kind: 'achievement',
              sourceRef: { type: 'experience', id: 'exp_1' },
              text: 'Configured Salesforce approval workflows.',
              metrics: [],
              tags: [],
              period: { start: '2021-01' },
              strength: 'core',
              origin: 'gap-fill',
            },
          ],
          dropped: [{ evidenceId: 'ev_gap_1', raw: '40%' }],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  ) as unknown as typeof fetch
})

describe('GapFill', () => {
  it('will not submit while every gap is blank, so skipping costs nothing', () => {
    renderPanel()
    expect(
      (screen.getByRole('button', { name: /record these/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('will not submit an answer with no role chosen', () => {
    renderPanel()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I built two workflows.' } })
    expect(
      (screen.getByRole('button', { name: /record these/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('shows the mapper reasoning beside the gap', () => {
    renderPanel()
    expect(screen.getByText(/nothing in your evidence mentions salesforce/i)).toBeTruthy()
  })

  it('sends what was written, with the role the user picked', async () => {
    renderPanel()
    fillFirstGap()
    fireEvent.click(screen.getByRole('button', { name: /record these/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse(
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    )
    expect(body.entries).toEqual([
      expect.objectContaining({
        requirementId: 'req_1',
        roleId: 'exp_1',
        answer: 'I built two workflows.',
      }),
    ])
  })

  it('shows the figures that were left out, not just a count', async () => {
    renderPanel()
    fillFirstGap()
    fireEvent.click(screen.getByRole('button', { name: /record these/i }))

    await waitFor(() => expect(screen.getByText('40%')).toBeTruthy())
  })

  it('saves before it re-scores', async () => {
    renderPanel()
    fillFirstGap()
    fireEvent.click(screen.getByRole('button', { name: /record these/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save and re-score/i })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: /save and re-score/i }))

    await waitFor(() => expect(remapMock).toHaveBeenCalled())
    expect(acceptMock.mock.invocationCallOrder[0]).toBeLessThan(
      remapMock.mock.invocationCallOrder[0],
    )
  })

  it('keeps the user on the review screen when the save fails', async () => {
    acceptMock.mockResolvedValue({ ok: false, error: 'nope', code: 'invalid-request' })
    renderPanel()
    fillFirstGap()
    fireEvent.click(screen.getByRole('button', { name: /record these/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save and re-score/i })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: /save and re-score/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(remapMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /save and re-score/i })).toBeTruthy()
  })

  it('says which requirements can only be fixed on the profile', () => {
    renderPanel({ blockers: [{ ...req('req_9', 'CET overlap'), kind: 'timezone' }] })
    expect(screen.getByText(/judged against your profile/i)).toBeTruthy()
  })
  it('shows the secondary gaps up front when nothing mandatory is missing', () => {
    // Otherwise the screen promises gaps and renders no fields at all: a
    // posting whose misses are all partial or optional looks broken.
    renderPanel({
      primary: [],
      secondary: [
        {
          requirement: req('req_2', 'Python'),
          rationale: 'No Python anywhere in your history.',
          strength: 'none' as const,
        },
      ],
    })

    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByText(/no python anywhere/i)).toBeTruthy()
  })
  it('does not offer a paid re-score when the draft came back with nothing', async () => {
    // Real-run finding: answering a gap with something the role's evidence
    // already covers makes the dedupe rule return zero records — correct, but
    // the review screen still rendered its heading over an empty list and a
    // save button that would bank nothing and pay for a remap regardless.
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ evidence: [], dropped: [] }), {
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    renderPanel()
    fillFirstGap()
    fireEvent.click(screen.getByRole('button', { name: /record these/i }))

    await waitFor(() => expect(screen.getByText(/already covered/i)).toBeTruthy())
    expect(screen.queryByRole('button', { name: /save and re-score/i })).toBeNull()
  })
})
