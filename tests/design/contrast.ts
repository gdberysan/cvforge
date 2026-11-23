// tests/design/contrast.ts
import { readFileSync } from 'node:fs'

const lum = (hex: string) => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6)
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Declarations of one block body: `--name: value;` pairs. */
function decls(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out[m[1]] = m[2].replace(/\/\*.*?\*\//g, '').trim()
  return out
}

/** Every `:root { … }` block body. */
function blocks(css: string, selector: RegExp): string[] {
  const out: string[] = []
  for (const m of css.matchAll(selector)) {
    let depth = 0
    const start = css.indexOf('{', m.index)
    let j = start
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}' && --depth === 0) break
    }
    out.push(css.slice(start + 1, j))
  }
  return out
}

/** The one palette (friendly redesign 2026-11-21): every :root block, in order. */
export function themeTokens(): Record<string, string> {
  const css = ['styles/korven/colors.css', 'app/globals.css']
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
  const raw: Record<string, string> = {}
  for (const b of blocks(css, /(^|\n)\s*:root\s*\{/g)) Object.assign(raw, decls(b))
  const resolve = (v: string, seen = 0): string => {
    const ref = v.match(/^var\((--[\w-]+)\)$/)
    return ref && seen < 10 ? resolve(raw[ref[1]] ?? v, seen + 1) : v
  }
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, resolve(v)]))
}
