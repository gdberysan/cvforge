import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : name === 'actions.ts' ? [full] : []
  })
}

/**
 * Demo must not write (product spec §5.4). Every server action opens with the
 * guard. Counted statically so no action can be added without it.
 */
describe('every server action is guarded for demo mode', () => {
  const files = walk(path.join(process.cwd(), 'app'))

  it('finds the action files', () => {
    expect(files.length).toBeGreaterThanOrEqual(7)
  })

  for (const file of files) {
    it(`${path.relative(process.cwd(), file)} guards each exported action`, () => {
      const src = readFileSync(file, 'utf8')
      const exported = (src.match(/^export async function /gm) ?? []).length
      const guarded = (src.match(/if \(isDemo\(\)\) return demoBlock\(\)/g) ?? []).length
      expect(guarded).toBe(exported)
    })
  }
})
