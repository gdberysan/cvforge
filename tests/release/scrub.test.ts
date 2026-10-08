import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findDenied, scanTreeForDenied } from '@/lib/release/scrub'

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

describe('scanTreeForDenied', () => {
  it('finds a term in compiled output, skips binaries and the named dirs', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cvforge-scan-'))
    try {
      mkdirSync(path.join(root, '.next', 'server', 'chunks'), { recursive: true })
      mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
      // The case the source gate could not see: a term that exists only in a
      // compiled chunk built from the working tree.
      writeFileSync(
        path.join(root, '.next', 'server', 'chunks', 'demo.js'),
        'var n="Zyxwq Persona"',
      )
      writeFileSync(path.join(root, 'node_modules', 'pkg', 'index.js'), 'zyxwq')
      writeFileSync(path.join(root, 'icon.png'), 'zyxwq')
      const { files, hits } = scanTreeForDenied(root, ['zyxwq'], { skipDirs: ['node_modules'] })
      expect(files).toBe(1)
      expect(hits).toEqual([
        { file: path.join('.next', 'server', 'chunks', 'demo.js'), term: 'zyxwq' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips binary files by content, not only by extension', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cvforge-scan-'))
    try {
      // An extensionless executable, like the bundled Node runtime.
      writeFileSync(
        path.join(root, 'node'),
        Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0]), Buffer.from('zyxwq')]),
      )
      writeFileSync(path.join(root, 'start.sh'), 'echo zyxwq')
      const { files, hits } = scanTreeForDenied(root, ['zyxwq'])
      expect(files).toBe(1)
      expect(hits).toEqual([{ file: 'start.sh', term: 'zyxwq' }])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
