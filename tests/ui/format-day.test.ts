import { describe, expect, it } from 'vitest'
import { formatDay } from '@/lib/ui/format-day'

describe('formatDay', () => {
  it('a SQLite timestamp is UTC: an evening analysis in Mexico keeps its own day', () => {
    // 2026-08-29 03:14 UTC is the evening of the 28th in Mexico City.
    expect(formatDay('2026-08-29 03:14:50', 'es', 'America/Mexico_City')).toBe('28 ago 2026')
  })
  it('a calendar day (a backup file) is that day everywhere', () => {
    expect(formatDay('2026-10-15', 'es', 'America/Mexico_City')).toBe('15 oct 2026')
    expect(formatDay('2026-10-15', 'en', 'Asia/Tokyo')).toBe('Oct 15, 2026')
  })
  it('an ISO instant is read as written', () => {
    expect(formatDay('2026-10-01T15:00:00.000Z', 'es', 'America/Mexico_City')).toBe('1 oct 2026')
  })
})
