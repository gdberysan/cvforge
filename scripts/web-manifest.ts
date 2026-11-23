/**
 * The web edition's receipt (runs last in `npm run web:build`): every file
 * the site serves, with its sha256, the commit it was built from, and one
 * fingerprint over the lot, written to web/out/build.json.
 *
 * Why: a web page reloads its code from the host on every visit, so "the
 * code is open" only helps if anyone can check that what the site serves IS
 * that code. CI builds the site from the public repository and signs this
 * file (GitHub artifact attestation, .github/workflows/web-deploy.yml);
 * `npm run web:verify -- <site>` downloads every listed file from the live
 * site and compares it with the receipt; `gh attestation verify` proves the
 * receipt came from that repository's CI at that commit. Ajustes shows the
 * commit and fingerprint so a person can see which build they are running.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const RECEIPT = 'build.json'

export type Receipt = {
  /** The commit the site was built from; `dirty` when the tree had changes. */
  commit: string
  dirty: boolean
  /** Where the source lives (a URL), when the build was told. */
  source: string | null
  /** sha256 over the sorted "hash  path" lines: one value names the build. */
  fingerprint: string
  files: Record<string, string>
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

/** Every file under `dir` (posix paths relative to it), the receipt excluded. */
export function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (at: string) => {
    for (const name of readdirSync(at).sort()) {
      const full = path.join(at, name)
      if (statSync(full).isDirectory()) walk(full)
      else {
        const rel = path.relative(dir, full).split(path.sep).join('/')
        if (rel !== RECEIPT) out[rel] = sha256(readFileSync(full))
      }
    }
  }
  walk(dir)
  return out
}

export function fingerprintOf(files: Record<string, string>): string {
  return sha256(
    Object.keys(files)
      .sort()
      .map((f) => `${files[f]}  ${f}\n`)
      .join(''),
  )
}

function gitCommit(): { commit: string; dirty: boolean } {
  if (process.env.GITHUB_SHA) return { commit: process.env.GITHUB_SHA, dirty: false }
  try {
    const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
    const commit = git('rev-parse', 'HEAD')
    const dirty = git('status', '--porcelain').length > 0
    return { commit, dirty }
  } catch {
    return { commit: 'unknown', dirty: true }
  }
}

if (process.argv[1]?.endsWith('web-manifest.ts')) {
  const out = path.join('web', 'out')
  const files = hashTree(out)
  if (Object.keys(files).length === 0) throw new Error(`nothing in ${out}: build first`)
  const receipt: Receipt = {
    ...gitCommit(),
    source: process.env.CVFORGE_SOURCE_URL ?? null,
    fingerprint: fingerprintOf(files),
    files,
  }
  writeFileSync(path.join(out, RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(
    `receipt: ${Object.keys(files).length} files, fingerprint ${receipt.fingerprint.slice(0, 12)}, commit ${receipt.commit.slice(0, 12)}${receipt.dirty ? ' (dirty)' : ''}`,
  )
}
