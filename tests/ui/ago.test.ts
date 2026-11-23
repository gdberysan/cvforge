import { describe, expect, it } from 'vitest'
import { ago } from '@/lib/ui/ago'

const NOW = new Date('2026-10-15T18:00:00Z')
describe('ago', () => {
  it("minutes, hours, then days, in the reader's language", () => {
    expect(ago('2026-10-15T17:20:00Z', 'es', NOW)).toBe('hace 40 min')
    expect(ago('2026-10-15T15:00:00Z', 'es', NOW)).toBe('hace 3 h')
    expect(ago('2026-10-13T18:00:00Z', 'es', NOW)).toBe('anteayer')
    expect(ago('2026-10-15T17:20:00Z', 'en', NOW)).toMatch(/^40 min\.? ago$/)
  })
  it('just now under a minute, and never in the future', () => {
    expect(ago('2026-10-15T17:59:40Z', 'es', NOW)).toBe('ahora')
    expect(ago('2026-10-15T18:05:00Z', 'en', NOW)).toBe('now')
  })
})
