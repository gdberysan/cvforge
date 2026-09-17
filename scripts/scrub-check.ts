/**
 * Release gate (spec §3.2): extract exactly what `git archive <ref>` would
 * ship, scan every text file against the private denylist, fail on any hit.
 *
 *   npm run scrub:check          # HEAD
 *   npm run scrub:check -- v1.0.0
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { findDenied } from '@/lib/release/scrub'

const DENYLIST = path.join(process.cwd(), 'evals', 'private', 'denylist.txt')
const ref = process.argv[2] ?? 'HEAD'
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|pdf|woff2?|ttf|otf|db|zip|gz|tgz)$/i

if (!existsSync(DENYLIST)) {
  console.error(
    `scrub-check: ${DENYLIST} is missing. Create it (one term per line) — refusing to release without it.`,
  )
  process.exit(2)
}
const terms = readFileSync(DENYLIST, 'utf8').split('\n')

const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-archive-'))
try {
  const tar = execFileSync('git', ['archive', '--format=tar', ref], {
    maxBuffer: 256 * 1024 * 1024,
  })
  execFileSync('tar', ['-x', '-C', dir], { input: tar })

  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((name) => {
      const full = path.join(d, name)
      return statSync(full).isDirectory() ? walk(full) : [full]
    })

  const files = walk(dir)
    .filter((f) => !BINARY.test(f))
    .map((f) => ({ path: path.relative(dir, f), content: readFileSync(f, 'utf8') }))

  const hits = findDenied(files, terms)
  if (hits.length > 0) {
    console.error(
      `scrub-check: ${hits.length} hit(s) in ${ref} — the release would ship personal context:`,
    )
    for (const h of hits) console.error(`  ${h.file}  ←  "${h.term}"`)
    process.exit(1)
  }
  const active = terms.filter((t) => t.trim().length >= 3).length
  console.log(
    `scrub-check: ${files.length} files in ${ref} scanned against ${active} terms — clean.`,
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
