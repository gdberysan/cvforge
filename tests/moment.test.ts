import { describe, expect, it } from 'vitest'
import { momentFor, onMoment, showMoment } from '@/lib/ui/moment'

describe('moments', () => {
  it('only the four logs that change a search earn one', () => {
    expect(momentFor('applied')).toBe('sent')
    expect(momentFor('interview')).toBe('interview')
    expect(momentFor('offer')).toBe('offer')
    expect(momentFor('rejected')).toBe('loss')
    expect(momentFor('acknowledged')).toBeNull()
    expect(momentFor('screen')).toBeNull()
    expect(momentFor('ghosted')).toBeNull()
  })

  it('reaches every listener until it unsubscribes', () => {
    const seen: string[] = []
    const off = onMoment((m) => seen.push(m.kind))
    showMoment('offer', 'app_1')
    off()
    showMoment('loss', 'app_1')
    expect(seen).toEqual(['offer'])
  })
})
