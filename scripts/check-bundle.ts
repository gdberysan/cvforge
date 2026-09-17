/**
 * Runs after `next build`: scans every client chunk for the API key.
 * Spec §12 gate 6. Exits non-zero on the first leak so a build that would
 * ship the key cannot be mistaken for a good one.
 */
import './load-env'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { findLeaks } from '@/lib/bundle/leaks'

const CLIENT_DIR = path.join(process.cwd(), '.next', 'static')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : []
  })
}

let files: string[]
try {
  files = walk(CLIENT_DIR)
} catch {
  console.error(`check-bundle: ${CLIENT_DIR} not found — run \`next build\` first.`)
  process.exit(2)
}

const secrets = [process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_AUTH_TOKEN].filter(
  (s): s is string => Boolean(s),
)

const leaks = findLeaks(
  files.map((f) => ({ path: path.relative(process.cwd(), f), content: readFileSync(f, 'utf8') })),
  { secrets },
)

if (leaks.length > 0) {
  console.error(`check-bundle: ${leaks.length} leak(s) in client chunks:`)
  for (const l of leaks) console.error(`  [${l.kind}] ${l.file}: …${l.excerpt}…`)
  process.exit(1)
}

console.log(`check-bundle: ${files.length} client chunks scanned, no API key present.`)
