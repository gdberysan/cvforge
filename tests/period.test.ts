import { describe, expect, it } from 'vitest'
import { monthYear, periodLabel } from '@/lib/period'

describe('periodLabel', () => {
  it('reads months, not ISO stamps', () => {
    expect(periodLabel('2026-01', '2026-08', 'es', 'actual')).toBe('ene 2026 – ago 2026')
    expect(periodLabel('2023-08', null, 'en', 'present')).toBe('Aug 2023 – present')
  })
  it('leaves what it cannot read as it is', () => {
    expect(monthYear('2016', 'es')).toBe('2016')
  })
})
