/**
 * Checks a live web edition against its receipt: `npm run web:verify --
 * https://site`. Downloads build.json, then every file it lists, and
 * compares each sha256 and the fingerprint. Prints what differs.
 *
 * This proves the site serves exactly the files in its receipt. To prove the
 * receipt itself came from the public repository's CI, run (needs `gh`):
 *   curl -sO https://site/build.json
 *   gh attestation verify build.json --repo <owner>/<repo>
 */
import { createHash } from 'node:crypto'
import { fingerprintOf, type Receipt } from './web-manifest'

const site = process.argv[2]?.replace(/\/$/, '')
if (!site) {
  console.error('usage: npm run web:verify -- https://site')
  process.exit(2)
}

const res = await fetch(`${site}/build.json`, { cache: 'no-store' })
if (!res.ok) throw new Error(`no receipt at ${site}/build.json (${res.status})`)
const receipt = (await res.json()) as Receipt
const bad: string[] = []
if (fingerprintOf(receipt.files) !== receipt.fingerprint)
  bad.push('the receipt does not match its own fingerprint')

const paths = Object.keys(receipt.files)
let done = 0
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (done < paths.length) {
      const rel = paths[done++] as string
      const r = await fetch(`${site}/${rel}`, { cache: 'no-store' })
      if (!r.ok) {
        // _headers and _redirects are the host's instructions, not served files.
        if (!rel.startsWith('_')) bad.push(`${rel}: HTTP ${r.status}`)
        continue
      }
      const hash = createHash('sha256')
        .update(Buffer.from(await r.arrayBuffer()))
        .digest('hex')
      if (hash !== receipt.files[rel]) bad.push(`${rel}: served bytes differ from the receipt`)
    }
  }),
)

console.log(`site:        ${site}`)
console.log(`commit:      ${receipt.commit}${receipt.dirty ? ' (built from a dirty tree)' : ''}`)
console.log(`source:      ${receipt.source ?? '(not stated)'}`)
console.log(`fingerprint: ${receipt.fingerprint}`)
console.log(`files:       ${paths.length} checked`)
if (bad.length) {
  console.log(`\nDIFFERENT (${bad.length}):\n${bad.map((b) => `  ${b}`).join('\n')}`)
  process.exit(1)
}
console.log('\nEvery served file matches the receipt.')
