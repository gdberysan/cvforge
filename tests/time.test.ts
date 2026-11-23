import { describe, expect, it } from 'vitest'
import {
  calendarDaysSince,
  endOfLocalDay,
  isDateOnly,
  localDay,
  safeZone,
  storedMs,
  wallClock,
  zonedToUtc,
} from '@/lib/time'

const MX = 'America/Mexico_City'
const NY = 'America/New_York'

describe('storedMs', () => {
  it("reads SQLite's zoneless CURRENT_TIMESTAMP as UTC, with or without seconds", () => {
    expect(storedMs('2026-08-28 22:14:50')).toBe(Date.parse('2026-08-28T22:14:50Z'))
    expect(storedMs('2026-08-28 22:14')).toBe(Date.parse('2026-08-28T22:14:00Z'))
    expect(storedMs('2026-08-28 22:14:50.123')).toBe(Date.parse('2026-08-28T22:14:50.123Z'))
  })

  it('leaves an ISO instant its own offset, a bare date at UTC midnight, garbage NaN', () => {
    expect(storedMs('2026-08-28T22:14:50-06:00')).toBe(Date.parse('2026-08-29T04:14:50Z'))
    expect(storedMs('2026-08-28')).toBe(Date.parse('2026-08-28T00:00:00Z'))
    expect(storedMs('soon')).toBeNaN()
  })
})

describe('wallClock', () => {
  it('reads an instant where the user is', () => {
    const w = wallClock(Date.parse('2026-10-06T01:30:00Z'), MX)
    expect(w).toMatchObject({ date: '2026-10-05', time: '19:30', hour: 19, minute: 30 })
  })

  it('midnight is 00, never 24', () => {
    expect(wallClock(Date.parse('2026-10-06T06:00:00Z'), MX).time).toBe('00:00')
  })

  it('an unknown zone reads as UTC instead of throwing', () => {
    expect(safeZone('Mars/Olympus')).toBe('UTC')
    expect(wallClock(Date.parse('2026-10-06T01:30:00Z'), 'Mars/Olympus').date).toBe('2026-10-06')
  })
})

describe('zonedToUtc', () => {
  it('turns a wall time into its instant', () => {
    expect(zonedToUtc({ year: 2026, month: 10, day: 5, hour: 8 }, MX)).toBe(
      Date.parse('2026-10-05T14:00:00Z'),
    )
  })

  it('a time inside a spring-forward gap does not exist', () => {
    expect(zonedToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY)).toBeNull()
  })

  it('a fall-back hour takes its first occurrence', () => {
    expect(zonedToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NY)).toBe(
      Date.parse('2026-11-01T05:30:00Z'),
    )
  })
})

describe('days', () => {
  it('a SQLite evening timestamp is that local day, not UTC tomorrow', () => {
    expect(localDay('2026-10-06 01:30:00', MX)).toBe('2026-10-05')
    expect(localDay('2026-10-05', MX)).toBe('2026-10-05')
    expect(isDateOnly('2026-10-05')).toBe(true)
  })

  it('counts calendar days, not 24-hour periods', () => {
    const now = Date.parse('2026-10-06T15:00:00Z') // 09:00 in Mexico City
    expect(calendarDaysSince('2026-10-06 04:00:00', now, MX)).toBe(1) // 22:00 the night before
  })

  it('a local day ends at its own midnight, across a DST change too', () => {
    expect(endOfLocalDay('2026-10-05', MX)).toBe(Date.parse('2026-10-06T06:00:00Z') - 1)
    expect(endOfLocalDay('2026-11-01', NY)).toBe(Date.parse('2026-11-02T05:00:00Z') - 1)
  })
})
