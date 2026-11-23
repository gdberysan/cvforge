import { describe, expect, it } from 'vitest'
import { isNewer, latestForLine, lineOf } from '@/lib/update'

describe('update line', () => {
  const manifest = { version: '1.2.27', lines: { '1.2': '1.2.27', '1.4': '1.4.1' } }

  it('offers each build only its own line', () => {
    expect(latestForLine(manifest, '1.2.26')).toBe('1.2.27')
    expect(latestForLine(manifest, '1.4.0')).toBe('1.4.1')
  })

  it('never offers another line, even from a legacy manifest', () => {
    expect(latestForLine({ version: '1.4.0' }, '1.2.26')).toBeNull()
    expect(latestForLine({ version: '1.2.26' }, '1.4.0')).toBeNull()
    expect(latestForLine({ version: '1.2.27' }, '1.2.26')).toBe('1.2.27')
  })

  it('ignores a malformed manifest', () => {
    expect(latestForLine(null, '1.2.26')).toBeNull()
    expect(latestForLine({ lines: { '1.2': 7 } }, '1.2.26')).toBeNull()
  })

  it('reads lines and compares versions numerically', () => {
    expect(lineOf('1.2.26')).toBe('1.2')
    expect(isNewer('1.2.10', '1.2.9')).toBe(true)
  })
})
