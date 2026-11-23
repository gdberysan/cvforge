/**
 * Applies a copy pass to lib/i18n/dictionary.ts: `tsx scripts/apply-copy.ts
 * changes.json` where changes.json is { key: { en?: string, es?: string } }.
 *
 * Each value is replaced where it stands (TypeScript's parser finds the
 * property in the `en` or `es` object), so comments, order and grouping
 * stay. Refuses a change that loses or adds a {placeholder}, or names a key
 * the dictionary does not have.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = 'lib/i18n/dictionary.ts'
type Change = Record<string, { en?: string; es?: string }>

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',')

/** A single-quoted TS string literal for `value`. */
function literal(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
}

/** Reads the quoted literal starting at `at`: its decoded text and end. */
function readLiteral(src: string, at: number): { text: string; end: number } | null {
  const q = src[at]
  if (q !== "'" && q !== '"') return null
  const ESC: Record<string, string> = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' }
  let i = at + 1
  let text = ''
  while (i < src.length && src[i] !== q) {
    if (src[i] === '\\') {
      const c = src[i + 1] as string
      if (c === 'u') {
        text += String.fromCharCode(Number.parseInt(src.slice(i + 2, i + 6), 16))
        i += 6
        continue
      }
      if (!(c in ESC)) return null
      text += ESC[c]
      i += 2
    } else text += src[i++]
  }
  return { text, end: i + 1 }
}

/** The span of `const <lang> = { … }` in the source. */
function block(src: string, lang: 'en' | 'es'): [number, number] {
  const start = src.search(new RegExp(`\\nconst ${lang}(: [^=]+)? = \\{`))
  if (start < 0) throw new Error(`no ${lang} object`)
  const end = src.indexOf('\n}', start)
  return [start, end]
}

export function applyCopy(
  source: string,
  changes: Change,
): { text: string; applied: number; refused: string[] } {
  const edits: { start: number; end: number; text: string }[] = []
  const refused: string[] = []
  for (const lang of ['en', 'es'] as const) {
    const [from, to] = block(source, lang)
    for (const [key, langs] of Object.entries(changes)) {
      const next = langs[lang]
      if (next === undefined) continue
      const needle = `\n  '${key}':`
      const at = source.indexOf(needle, from)
      if (at < 0 || at > to) {
        refused.push(`${key} (${lang}): no such key`)
        continue
      }
      let v = at + needle.length
      while (/\s/.test(source[v] ?? '')) v++
      const lit = readLiteral(source, v)
      if (!lit || source[lit.end] !== ',') {
        refused.push(`${key} (${lang}): not a plain string`)
        continue
      }
      if (placeholders(lit.text) !== placeholders(next)) {
        refused.push(
          `${key} (${lang}): placeholders {${placeholders(lit.text)}} -> {${placeholders(next)}}`,
        )
        continue
      }
      if (lit.text !== next) edits.push({ start: v, end: lit.end, text: literal(next) })
    }
  }
  let text = source
  for (const e of edits.sort((x, y) => y.start - x.start))
    text = text.slice(0, e.start) + e.text + text.slice(e.end)
  return { text, applied: edits.length, refused }
}

if (process.argv[1]?.endsWith('apply-copy.ts')) {
  const changes: Change = {}
  for (const f of process.argv.slice(2)) Object.assign(changes, JSON.parse(readFileSync(f, 'utf8')))
  const { text, applied, refused } = applyCopy(readFileSync(FILE, 'utf8'), changes)
  writeFileSync(FILE, text)
  console.log(`applied ${applied} strings; refused ${refused.length}`)
  for (const r of refused) console.log(`  refused: ${r}`)
}
