// tests/design/scan.ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export type Rule =
  | 'raw-colour'
  | 'palette-var'
  | 'emoji'
  | 'typed-arrow'
  | 'uppercase'
  | 'bare-hover'
  | 'inline-style'
  | 'native-tooltip'

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length

/** Strips @media (hover: hover) { … } blocks (one nesting level) so their :hover rules are not counted. */
function withoutHoverMedia(css: string): string {
  let out = ''
  let i = 0
  const marker = /@media\s*\(\s*hover\s*:\s*hover\s*\)/g
  for (let m = marker.exec(css); m; m = marker.exec(css)) {
    out += css.slice(i, m.index)
    let depth = 0
    let j = css.indexOf('{', m.index)
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}' && --depth === 0) break
    }
    i = j + 1
    marker.lastIndex = i
  }
  return out + css.slice(i)
}

export function scanSource(file: string, text: string): Partial<Record<Rule, number>> {
  const isCss = file.endsWith('.css')
  const isTsx = file.endsWith('.tsx')
  const hits: Partial<Record<Rule, number>> = {}
  const put = (rule: Rule, n: number) => {
    if (n > 0) hits[rule] = n
  }
  // #rgb / #rgba / #rrggbb / #rrggbbaa wherever it stands — attribute, string
  // or CSS — except an in-page anchor (href="#add" looks like hex), an HTML
  // entity (&#123;) or a URL fragment.
  const noAnchors = text.replace(/href=(["'])#[^"']*\1/g, '')
  put(
    'raw-colour',
    count(noAnchors, /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g) +
      count(text, /\b(?:rgb|rgba|hsl|hsla)\(/g),
  )
  put('palette-var', count(text, /--(?:(?:graphite|amber)-\d{2,3}|korven-[a-z]+)\b/g))
  put('emoji', count(text, /\p{Extended_Pictographic}/gu))
  // An arrow typed into prose: "→" anywhere, or " -> " between words inside a string.
  put('typed-arrow', count(text, /→/g) + count(text, /\s->\s/g))
  if (isCss) {
    put('uppercase', count(text, /text-transform\s*:\s*uppercase/g))
    put('bare-hover', count(withoutHoverMedia(text), /:hover\b/g))
  }
  if (isTsx) put('inline-style', count(text, /style=\{\{/g))
  // A `title` on an element is the browser's own tooltip: slow, unstyled,
  // unreachable by touch (standard point 11). An iframe's title is its
  // accessible name, not a tooltip, so it is exempt.
  if (isTsx)
    put('native-tooltip', count(text, /<(?!iframe\b)(?:[a-z][a-z0-9]*|Link)\b[^<>]*?\stitle=/g))
  return hits
}

const SCAN_DIRS = ['app', 'components', 'lib/i18n']
const SKIP = new Set(['node_modules', '.next'])

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(p)
  }
}

export function scanRepo(root: string): Record<string, Partial<Record<Rule, number>>> {
  const files: string[] = []
  for (const d of SCAN_DIRS) walk(path.join(root, d), files)
  const result: Record<string, Partial<Record<Rule, number>>> = {}
  for (const f of files.sort()) {
    const rel = path.relative(root, f)
    let text = readFileSync(f, 'utf8')
    // The token definitions are where colours and uppercase are allowed to live.
    if (rel === 'app/globals.css')
      text = text.replace(/\/\* TOKENS:BEGIN \*\/[\s\S]*?\/\* TOKENS:END \*\//, '')
    const hits = scanSource(rel, text)
    if (Object.keys(hits).length > 0) result[rel] = hits
  }
  return result
}
