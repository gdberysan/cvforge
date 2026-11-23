import { describe, expect, it } from 'vitest'
import { roundOf } from '@/lib/prep/round'

const row = (id: string, type: 'applied' | 'screen' | 'interview', scheduledAt: string | null) => ({
  id,
  at: '2026-10-01T00:00:00.000Z',
  type,
  note: null,
  scheduledAt,
  meetingUrl: null,
})
const NOW = Date.parse('2026-10-18T09:00:00Z')

describe('roundOf', () => {
  it('is the upcoming interview after a screen, numbered 1', () => {
    const r = roundOf(
      [
        row('a', 'applied', null),
        row('s', 'screen', '2026-10-16'),
        row('i', 'interview', '2026-10-20T16:45:00.000Z'),
      ],
      undefined,
      NOW,
    )
    expect(r).toMatchObject({
      kind: 'interview',
      n: 1,
      eventId: 'i',
      scheduledAt: '2026-10-20T16:45:00.000Z',
    })
  })

  it('numbers a second interview 2', () => {
    const r = roundOf(
      [row('i1', 'interview', '2026-10-10'), row('i2', 'interview', '2026-10-25')],
      undefined,
      NOW,
    )
    expect(r).toMatchObject({ kind: 'interview', n: 2, eventId: 'i2' })
  })

  it('is a screen, numbered 0, when only a screen is logged', () => {
    expect(roundOf([row('s', 'screen', '2026-10-21')], undefined, NOW)).toMatchObject({
      kind: 'screen',
      n: 0,
    })
  })

  it('falls back to the latest call when none is upcoming', () => {
    expect(
      roundOf(
        [row('i1', 'interview', '2026-10-01'), row('i2', 'interview', '2026-10-05')],
        undefined,
        NOW,
      ),
    ).toMatchObject({
      eventId: 'i2',
    })
  })

  it('takes the event it is given', () => {
    expect(
      roundOf(
        [row('i1', 'interview', '2026-10-10'), row('i2', 'interview', '2026-10-25')],
        'i1',
        NOW,
      ),
    ).toMatchObject({
      eventId: 'i1',
      n: 1,
    })
  })

  it('keeps a date-only call upcoming until midnight where the user is, not in UTC', () => {
    const calls = [row('i1', 'interview', '2026-10-20'), row('i2', 'interview', '2026-10-25')]
    const mx = 'America/Mexico_City'
    // 18:30 on the 20th in Mexico City is already the 21st in UTC.
    expect(roundOf(calls, undefined, Date.parse('2026-10-21T00:30:00Z'), mx)).toMatchObject({
      eventId: 'i1',
    })
    expect(roundOf(calls, undefined, Date.parse('2026-10-21T06:30:00Z'), mx)).toMatchObject({
      eventId: 'i2',
    })
  })

  it('is null with no screen or interview', () => {
    expect(roundOf([row('a', 'applied', null)], undefined, NOW)).toBeNull()
  })
})
