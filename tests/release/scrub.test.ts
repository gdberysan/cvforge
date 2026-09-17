import { describe, expect, it } from 'vitest'
import { findDenied } from '@/lib/release/scrub'

describe('findDenied', () => {
  const files = [
    { path: 'README.md', content: 'CVForge runs on your machine.' },
    { path: 'tests/x.test.ts', content: "fullName: 'Juan Pérez Example'" },
  ]

  it('returns nothing when no term appears', () => {
    expect(findDenied(files, ['Nobody Here'])).toEqual([])
  })

  it('matches case-insensitively and names the file and term', () => {
    expect(findDenied(files, ['juan pérez'])).toEqual([
      { file: 'tests/x.test.ts', term: 'juan pérez' },
    ])
  })

  it('reports one hit per file and term, not per occurrence', () => {
    const twice = [{ path: 'a.md', content: 'secret secret' }]
    expect(findDenied(twice, ['secret'])).toHaveLength(1)
  })

  it('ignores blank lines and very short terms from a sloppy denylist', () => {
    expect(findDenied(files, ['', '  ', 'on'])).toEqual([])
  })
})
