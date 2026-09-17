import { describe, expect, it } from 'vitest'
import { findLeaks } from '@/lib/bundle/leaks'

/** Spec §12 gate 6 — no API key, by value or by access, in any client chunk. */
describe('findLeaks', () => {
  const secret = 'sk-ant-api03-REALKEYVALUE0123456789'

  it('returns nothing for a clean chunk', () => {
    expect(
      findLeaks([{ path: 'a.js', content: 'console.log("hi")' }], { secrets: [secret] }),
    ).toEqual([])
  })

  it('finds the configured key value verbatim', () => {
    const leaks = findLeaks([{ path: 'chunk.js', content: `const k="${secret}";` }], {
      secrets: [secret],
    })
    // The configured value is also Anthropic-shaped, so both signals fire.
    expect(leaks.map((l) => l.kind)).toEqual(['key-value', 'key-prefix'])
    expect(leaks[0].file).toBe('chunk.js')
  })

  it('finds any Anthropic-shaped key even when it is not the configured one', () => {
    const leaks = findLeaks(
      [{ path: 'chunk.js', content: 'x="sk-ant-api03-someotherkeyvalue_XYZ"' }],
      { secrets: [] },
    )
    expect(leaks).toMatchObject([{ kind: 'key-prefix' }])
  })

  it('finds server-only env access that reached the client bundle', () => {
    const leaks = findLeaks(
      [{ path: 'chunk.js', content: 'const k=process.env.ANTHROPIC_API_KEY' }],
      { secrets: [] },
    )
    expect(leaks).toMatchObject([{ kind: 'env-access' }])
  })

  it('does not flag the variable NAME in user-facing copy', () => {
    // The setup screen legitimately says "put ANTHROPIC_API_KEY in .env.local".
    const leaks = findLeaks(
      [{ path: 'dict.js', content: '"Put ANTHROPIC_API_KEY in .env.local, then restart."' }],
      { secrets: [] },
    )
    expect(leaks).toEqual([])
  })

  it('ignores secrets too short to be meaningful', () => {
    const leaks = findLeaks([{ path: 'a.js', content: 'abc' }], { secrets: ['abc', ''] })
    expect(leaks).toEqual([])
  })
})
