// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { upsertEvidenceAction } from '@/app/(app)/evidence/actions'
import { EvidenceEditor } from '@/components/evidence/EvidenceEditor'
import { EVIDENCE_FILTER_EVENT } from '@/components/evidence/ShowEvidenceButton'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'

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
      title: 'Compensation & Benefits Intern',
      company: 'Halvorsen Pharma',
      period: { start: '2012-04', end: '2012-11' },
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

const RECORD_ARIA = 'What you did, in full'
const NUMBER_ARIA = "Number, written the way you'd say it"
/** What the strength card's button does: narrow the page to one filter. */
const showOnly = (filter: string) =>
  act(() => {
    window.dispatchEvent(new CustomEvent(EVIDENCE_FILTER_EVENT, { detail: filter }))
  })
const base = {
  kind: 'achievement' as const,
  sourceRef: { type: 'experience' as const, id: 'exp_7' },
  tags: ['hr'],
  period: { start: '2012-04', end: '2012-11' },
  strength: 'core' as const,
  origin: 'manual' as const,
}
const a: EvidenceItem = { ...base, id: 'ev_a', text: 'Ran the wellness programme', metrics: [] }
const b: EvidenceItem = {
  ...base,
  id: 'ev_b',
  text: 'Cut onboarding time',
  metrics: [{ raw: 'by 30%', value: 30, unit: '%' }],
}

function setPhone(phone: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: phone && q === '(max-width: 699px)',
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
  vi.mocked(upsertEvidenceAction).mockReset().mockResolvedValue({ ok: true })
})

describe('EvidenceEditor — who is open', () => {
  it('records start in the read view', () => {
    setPhone(false)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    expect(screen.queryAllByLabelText(RECORD_ARIA)).toHaveLength(0)
  })

  it('on a phone only one record is open at a time', async () => {
    setPhone(true)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    await waitFor(() => expect(screen.getAllByLabelText(RECORD_ARIA)).toHaveLength(1))
    fireEvent.click(screen.getByText(b.text))
    await waitFor(() =>
      expect((screen.getByLabelText(RECORD_ARIA) as HTMLTextAreaElement).value).toBe(b.text),
    )
    expect(screen.getAllByLabelText(RECORD_ARIA)).toHaveLength(1)
  })

  it('on a desktop several records may be open', async () => {
    setPhone(false)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    fireEvent.click(screen.getByText(b.text))
    await waitFor(() => expect(screen.getAllByLabelText(RECORD_ARIA)).toHaveLength(2))
  })

  it('opening another record flushes the first one’s pending save at once', async () => {
    setPhone(true)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    fireEvent.change(await screen.findByLabelText(RECORD_ARIA), {
      target: { value: 'typed fast' },
    })
    fireEvent.click(screen.getByText(b.text))
    await waitFor(() =>
      expect(upsertEvidenceAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: a.id, text: 'typed fast' }),
      ),
    )
    await waitFor(() =>
      expect((screen.getByLabelText(RECORD_ARIA) as HTMLTextAreaElement).value).toBe(b.text),
    )
  })

  it('a failing flush keeps the first record open and does not open the second', async () => {
    setPhone(true)
    vi.mocked(upsertEvidenceAction).mockResolvedValue({ ok: false, error: 'x' } as never)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    fireEvent.change(await screen.findByLabelText(RECORD_ARIA), {
      target: { value: 'typed fast' },
    })
    fireEvent.click(screen.getByText(b.text))
    await waitFor(() => expect(upsertEvidenceAction).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getAllByLabelText(RECORD_ARIA)).toHaveLength(1)
    expect((screen.getByLabelText(RECORD_ARIA) as HTMLTextAreaElement).value).toBe('typed fast')
  })

  it('a second tap while the flush is in flight still waits for it', async () => {
    setPhone(true)
    let settle: (r: { ok: boolean }) => void = () => {}
    vi.mocked(upsertEvidenceAction).mockImplementation(
      () => new Promise((r) => (settle = r as typeof settle)) as never,
    )
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    fireEvent.change(await screen.findByLabelText(RECORD_ARIA), {
      target: { value: 'typed fast' },
    })
    fireEvent.click(screen.getByText(b.text))
    await waitFor(() => expect(upsertEvidenceAction).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByText(b.text))
    await new Promise((r) => setTimeout(r, 20))
    settle({ ok: false })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getAllByLabelText(RECORD_ARIA)).toHaveLength(1)
    expect((screen.getByLabelText(RECORD_ARIA) as HTMLTextAreaElement).value).toBe('typed fast')
  })

  it('switching while the debounced save is in flight waits for its answer', async () => {
    setPhone(true)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let settle: (r: { ok: boolean }) => void = () => {}
    vi.mocked(upsertEvidenceAction).mockImplementation(
      () => new Promise((r) => (settle = r as typeof settle)) as never,
    )
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    fireEvent.change(await screen.findByLabelText(RECORD_ARIA), {
      target: { value: 'typed slow' },
    })
    await vi.advanceTimersByTimeAsync(900)
    vi.useRealTimers()
    await waitFor(() => expect(upsertEvidenceAction).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByText(b.text))
    await new Promise((r) => setTimeout(r, 20))
    settle({ ok: false })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getAllByLabelText(RECORD_ARIA)).toHaveLength(1)
    expect((screen.getByLabelText(RECORD_ARIA) as HTMLTextAreaElement).value).toBe('typed slow')
  })

  it('"Done" closes the record once its edit is saved', async () => {
    setPhone(false)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    fireEvent.change(await screen.findByLabelText(RECORD_ARIA), { target: { value: 'edited' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryAllByLabelText(RECORD_ARIA)).toHaveLength(0))
    expect(upsertEvidenceAction).toHaveBeenCalledWith(expect.objectContaining({ text: 'edited' }))
    expect(screen.getByText('edited')).toBeTruthy()
  })

  it("the strength card's filter says it is on and takes you back", () => {
    setPhone(false)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    expect(screen.queryByText('Only the results without a number')).toBeNull()
    showOnly('unquantified')
    expect(screen.getByText('Only the results without a number')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    expect(screen.queryByText('Only the results without a number')).toBeNull()
  })

  for (const phone of [false, true]) {
    it(`"Add the numbers" opens each result to its number field alone (${phone ? 'phone' : 'desktop'})`, () => {
      setPhone(phone)
      render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
      showOnly('unquantified')
      // The number, focused; not the whole form.
      const field = screen.getByLabelText(NUMBER_ARIA)
      expect(document.activeElement).toBe(field)
      expect(screen.queryByLabelText(RECORD_ARIA)).toBeNull()
      expect(screen.queryByText('Skill tags')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'More options' }))
      expect(screen.getByLabelText(RECORD_ARIA)).toBeTruthy()
    })
  }

  it('"Add a number" opens the editor with a new number field', async () => {
    setPhone(true)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a number' }))
    await waitFor(() => expect(screen.getAllByLabelText(RECORD_ARIA)).toHaveLength(1))
    expect(document.activeElement).toBe(screen.getAllByLabelText(NUMBER_ARIA).at(-1))
  })

  it('a new draft stays open after its first save lands (C1)', async () => {
    setPhone(false)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add an entry' }))
    const draft = screen
      .getAllByLabelText(RECORD_ARIA)
      .find((t) => (t as HTMLTextAreaElement).value === '') as HTMLTextAreaElement
    fireEvent.change(draft, { target: { value: 'Led the' } })
    await vi.advanceTimersByTimeAsync(900)
    vi.useRealTimers()
    await waitFor(() => expect(upsertEvidenceAction).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getAllByDisplayValue('Led the')).toHaveLength(1)
  })

  it('typing the number under "Add the numbers" keeps the entry on screen (I1)', async () => {
    setPhone(true)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    showOnly('unquantified')
    fireEvent.change(screen.getByLabelText(NUMBER_ARIA), { target: { value: '18%' } })
    await new Promise((r) => setTimeout(r, 30))
    // It has its number now, yet stays until it is saved and you move on.
    expect(screen.getByDisplayValue('18%')).toBeTruthy()
  })

  it('an empty number field is never sent, so it never fails a save (I2)', async () => {
    setPhone(true)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a number' }))
    await waitFor(() => expect(screen.getAllByLabelText(RECORD_ARIA)).toHaveLength(1))
    fireEvent.click(screen.getByText(b.text))
    await waitFor(() =>
      expect((screen.getByLabelText(RECORD_ARIA) as HTMLTextAreaElement).value).toBe(b.text),
    )
    for (const [sent] of vi.mocked(upsertEvidenceAction).mock.calls)
      expect(sent.metrics.every((m) => m.raw.trim() !== '')).toBe(true)
  })

  it('after a failed save, "Done" sends the edit again (I3)', async () => {
    setPhone(false)
    vi.mocked(upsertEvidenceAction).mockResolvedValueOnce({ ok: false, error: 'x' } as never)
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    fireEvent.change(await screen.findByLabelText(RECORD_ARIA), { target: { value: 'kept' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(upsertEvidenceAction).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(upsertEvidenceAction).toHaveBeenCalledTimes(2))
    expect(vi.mocked(upsertEvidenceAction).mock.calls[1][0]).toMatchObject({ text: 'kept' })
    await waitFor(() => expect(screen.queryAllByLabelText(RECORD_ARIA)).toHaveLength(0))
  })

  it('leaving the page sends an edit still waiting for its 800 ms (M1)', async () => {
    setPhone(false)
    const { unmount } = render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    fireEvent.change(await screen.findByLabelText(RECORD_ARIA), { target: { value: 'just typed' } })
    unmount()
    expect(upsertEvidenceAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: a.id, text: 'just typed' }),
    )
  })

  it('what kind an entry is gets chosen in its editor, and saved', async () => {
    setPhone(false)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<EvidenceEditor profile={profile} evidence={[a, b]} />)
    fireEvent.click(screen.getByText(a.text))
    fireEvent.change(await screen.findByLabelText('What kind of entry this is'), {
      target: { value: 'project-highlight' },
    })
    await vi.advanceTimersByTimeAsync(900)
    vi.useRealTimers()
    await waitFor(() =>
      expect(upsertEvidenceAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: a.id, kind: 'project-highlight' }),
      ),
    )
  })
})
