import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { dictionary } from '@/lib/i18n/dictionary'

/**
 * Every dictionary key is read by some code. A key nothing reads still ships
 * in every bundle and still costs a translation pass, and hides which copy is
 * live when the words change (launch audit 2026-11-23: 79 of them).
 *
 * A read is a key written as a string, the base of a plural (`x.one` /
 * `x.other` read through `plural(t, n, 'x')`), or a template prefix
 * (`error.${kind}` reads every `error.` key).
 */
const ROOTS = ['lib', 'app', 'components', 'web/app', 'web/lib', 'web/worker', 'web/trial']
const SKIP = new Set(['node_modules', '.next', 'site', 'out', 'public', 'dist'])

function sources(dir: string): string[] {
  let found: string[] = []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return found
  }
  for (const name of names) {
    if (SKIP.has(name)) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) found = found.concat(sources(full))
    else if (/\.(ts|tsx)$/.test(name) && !full.endsWith(path.join('i18n', 'dictionary.ts'))) {
      found.push(full)
    }
  }
  return found
}

describe('dictionary', () => {
  it('has no key that nothing reads', () => {
    const code = ROOTS.flatMap(sources)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    const quoted = new Set(
      Array.from(code.matchAll(/['"`]([a-zA-Z][\w.-]*\.[\w.-]+)['"`]/g), (m) => m[1]),
    )
    const prefixes = [
      ...Array.from(code.matchAll(/`([a-zA-Z][\w.-]*\.)\$\{/g), (m) => m[1] ?? ''),
      ...Array.from(code.matchAll(/['"]([a-zA-Z][\w.-]*\.)['"]\s*\+/g), (m) => m[1] ?? ''),
    ].filter(Boolean)
    const unread = Object.keys(dictionary.en).filter((key) => {
      if (quoted.has(key)) return false
      const base = key.replace(/\.(one|other)$/, '')
      if (base !== key && quoted.has(base)) return false
      return !prefixes.some((p) => key.startsWith(p))
    })
    expect(unread).toEqual([])
  })
})
