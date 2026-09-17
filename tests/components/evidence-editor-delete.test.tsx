// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteEvidenceAction, upsertEvidenceAction } from '@/app/(app)/evidence/actions'
import { EvidenceEditor } from '@/components/evidence/EvidenceEditor'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'

vi.mock('@/app/(app)/evidence/actions', () => ({
  deleteEvidenceAction: vi.fn(),
  upsertEvidenceAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const profile: MasterProfile = {
  basics: {
    fullName: 'Dana Sofía Pérez Ruiz',
    headline: 'Full-stack engineer',
    email: 'x@example.com',
    phone: '+52 55 0000 0000',
    location: 'Ciudad de México',
    timezone: 'America/Mexico_City',
    links: [],
  },
  summary: '',
  experience: [
    {
      id: 'exp_1',
      title: 'Engineer',
      company: 'Tiendamax',
      period: { start: '2016-01', end: '2018-06' },
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

const item: EvidenceItem = {
  id: 'ev_a',
  kind: 'achievement',
  sourceRef: { type: 'experience', id: 'exp_1' },
  text: 'Rebuilt checkout',
  metrics: [],
  tags: [],
  period: { start: '2016-01' },
  strength: 'core',
  origin: 'manual',
}

// jsdom has no ResizeObserver; AutoTextarea only uses it to size itself.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

function deleteTheRecord() {
  render(<EvidenceEditor profile={profile} evidence={[item]} />)
  fireEvent.click(screen.getByRole('button', { name: 'delete' }))
  fireEvent.click(screen.getByRole('button', { name: 'yes' }))
}

afterEach(() => {
  cleanup()
  // restoreAllMocks leaves module-mock vi.fn() call history intact; clear it
  // so a call made by one test never satisfies (or fails) another's assert.
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('EvidenceEditor orphaned records', () => {
  it('shows records whose role is gone instead of hiding them', () => {
    // A re-imported CV can drop a role; its interviewed records survive and
    // still feed the mapper. Invisible-but-active is the worst state — the
    // list must show them so they can be kept, edited, or deleted.
    const orphan: EvidenceItem = {
      ...item,
      id: 'ev_orphan',
      text: 'Recorded under a role that no longer exists',
      sourceRef: { type: 'experience', id: 'exp_gone' },
    }
    render(<EvidenceEditor profile={profile} evidence={[item, orphan]} />)
    expect(screen.getByText('Records without a role')).toBeTruthy()
    expect(screen.getByDisplayValue('Recorded under a role that no longer exists')).toBeTruthy()
  })

  it('stays hidden when every record has its role', () => {
    render(<EvidenceEditor profile={profile} evidence={[item]} />)
    expect(screen.queryByText('Records without a role')).toBeNull()
  })
})

describe('EvidenceEditor delete', () => {
  it('a refused delete restores the row and reports the failure', async () => {
    // The row is removed optimistically before the await; if the action
    // refuses ({ok:false} — the demo guard's shape) the record still exists
    // in the store, so the list must put it back and say so — not "saved".
    vi.mocked(deleteEvidenceAction).mockResolvedValue({ ok: false, error: 'Demo is read-only.' })

    deleteTheRecord()

    await screen.findByText('save failed')
    expect(screen.getByDisplayValue('Rebuilt checkout')).toBeTruthy()
  })

  it('a successful delete removes the row and offers undo', async () => {
    vi.mocked(deleteEvidenceAction).mockResolvedValue({ ok: true, sortOrder: 3 })

    deleteTheRecord()

    await screen.findByText('saved')
    expect(screen.queryByDisplayValue('Rebuilt checkout')).toBeNull()
    expect(screen.getByRole('button', { name: /undo/i })).toBeTruthy()
  })

  it('undo restores the record at its stored position, not the top of the group', async () => {
    vi.mocked(deleteEvidenceAction).mockResolvedValue({ ok: true, sortOrder: 3 })
    vi.mocked(upsertEvidenceAction).mockResolvedValue({ ok: true })

    deleteTheRecord()
    fireEvent.click(await screen.findByRole('button', { name: /undo/i }))

    await screen.findByText('saved')
    // The delete returned sortOrder 3; undo must pass it back so the re-insert
    // lands where it was rather than defaulting to 0.
    expect(upsertEvidenceAction).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }), 3)
  })

  it('a refused undo takes the row back out and reports the failure', async () => {
    vi.mocked(deleteEvidenceAction).mockResolvedValue({ ok: true, sortOrder: 3 })
    vi.mocked(upsertEvidenceAction).mockResolvedValue({ ok: false, error: 'Demo is read-only.' })

    deleteTheRecord()
    fireEvent.click(await screen.findByRole('button', { name: /undo/i }))

    await screen.findByText('save failed')
    expect(screen.queryByDisplayValue('Rebuilt checkout')).toBeNull()
  })

  it('deleting a record cancels its pending debounced save', async () => {
    // Edit, then delete within the 800ms debounce window: the stale timer
    // must not fire and re-insert the record the user just deleted.
    vi.useFakeTimers()
    try {
      vi.mocked(deleteEvidenceAction).mockResolvedValue({ ok: true, sortOrder: 3 })
      render(<EvidenceEditor profile={profile} evidence={[item]} />)
      fireEvent.change(screen.getByDisplayValue('Rebuilt checkout'), {
        target: { value: 'Rebuilt checkout flow' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'delete' }))
      fireEvent.click(screen.getByRole('button', { name: 'yes' }))
      await act(() => vi.advanceTimersByTimeAsync(3000))
      expect(upsertEvidenceAction).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('EvidenceEditor server refresh', () => {
  it('adopts the fresh evidence when the server re-renders with fewer records', () => {
    // After deleting a role, router.refresh() delivers evidence without that
    // role's records. Keeping the stale list would resurrect them as
    // editable "orphans" that one keystroke re-upserts into the database.
    const { rerender } = render(<EvidenceEditor profile={profile} evidence={[item]} />)
    expect(screen.getByDisplayValue('Rebuilt checkout')).toBeTruthy()
    rerender(<EvidenceEditor profile={profile} evidence={[]} />)
    expect(screen.queryByDisplayValue('Rebuilt checkout')).toBeNull()
  })
})
