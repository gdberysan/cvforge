import { describe, expect, it } from 'vitest'
import type { OutcomeEvent } from '@/lib/schemas'
import { deriveStatus } from '@/lib/status'

const at = (day: number) => new Date(Date.UTC(2026, 7, day)).toISOString()
const outcome = (type: OutcomeEvent['type'], day: number): OutcomeEvent => ({ at: at(day), type })

describe('deriveStatus', () => {
  it('is triaged with no outcomes and no documents', () => {
    expect(deriveStatus({ outcomes: [], hasDocuments: false, archived: false })).toBe('triaged')
  })

  it('is drafting once documents exist but nothing has happened', () => {
    expect(deriveStatus({ outcomes: [], hasDocuments: true, archived: false })).toBe('drafting')
  })

  it('maps applied and acknowledged to applied', () => {
    expect(
      deriveStatus({ outcomes: [outcome('applied', 1)], hasDocuments: true, archived: false }),
    ).toBe('applied')
    expect(
      deriveStatus({
        outcomes: [outcome('applied', 1), outcome('acknowledged', 2)],
        hasDocuments: true,
        archived: false,
      }),
    ).toBe('applied')
  })

  it('maps screen and interview to interviewing', () => {
    expect(
      deriveStatus({
        outcomes: [outcome('applied', 1), outcome('screen', 3)],
        hasDocuments: true,
        archived: false,
      }),
    ).toBe('interviewing')
  })

  it('uses the latest outcome by date, not array order', () => {
    const outOfOrder = [outcome('offer', 9), outcome('applied', 1), outcome('interview', 5)]
    expect(deriveStatus({ outcomes: outOfOrder, hasDocuments: true, archived: false })).toBe(
      'offer',
    )
  })

  it('maps rejected, withdrawn, and ghosted to closed', () => {
    for (const type of ['rejected', 'withdrawn', 'ghosted'] as const) {
      expect(
        deriveStatus({ outcomes: [outcome(type, 4)], hasDocuments: true, archived: false }),
      ).toBe('closed')
    }
  })

  it('archived overrides everything', () => {
    expect(
      deriveStatus({ outcomes: [outcome('offer', 9)], hasDocuments: true, archived: true }),
    ).toBe('archived')
  })
})
