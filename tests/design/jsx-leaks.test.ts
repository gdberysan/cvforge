import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A conditional that lost its braces inside JSX ("error && (" on its own
 * line) is valid JSX text: types, lint and tests all pass while the page
 * prints the code (1.2.75, every saved answer). Find any such line.
 */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : []
  })

describe('JSX text that is really code', () => {
  it('has no bare `x && (` or `)` line among JSX children', () => {
    const leaks: string[] = []
    for (const f of [...files('components'), ...files('app')]) {
      const lines = readFileSync(f, 'utf8').split('\n')
      lines.forEach((line, i) => {
        const prev = lines[i - 1]?.trim() ?? ''
        // A child line after a closing tag or another child, starting with a
        // bare identifier conditional: inside JSX, not inside code.
        if (/^\s+[\w.!?]+\s*&&\s*\($/.test(line) && /(?:>|\/>)$/.test(prev)) {
          leaks.push(`${f}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(leaks).toEqual([])
  })
})
