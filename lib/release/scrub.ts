import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * The release gate that keeps the author out of the product. The denylist
 * itself is private (spec §3.2); this is only the matcher, so users can run
 * the suite without ever seeing the terms.
 */
export function findDenied(
  files: { path: string; content: string }[],
  terms: string[],
): { file: string; term: string }[] {
  const cleaned = terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3)
  const hits: { file: string; term: string }[] = []
  for (const file of files) {
    const haystack = file.content.toLowerCase()
    for (const term of cleaned) {
      if (haystack.includes(term)) hits.push({ file: file.path, term })
    }
  }
  return hits
}

const BINARY =
  /\.(png|jpe?g|gif|webp|ico|icns|pdf|woff2?|ttf|otf|db|zip|gz|tgz|node|wasm|dylib|so|dll|exe)$/i

/**
 * Every denylist hit in the text files under `root`. Shared by the source
 * gate (a git archive) and the boot gate (the extracted zip) — the zip is
 * compiled from the working tree, so compiled demo and discover output
 * exists only there and the source gate can never see it.
 */
export function scanTreeForDenied(
  root: string,
  terms: string[],
  opts: { skipDirs?: string[] } = {},
): { files: number; hits: { file: string; term: string }[] } {
  const skip = new Set(opts.skipDirs ?? [])
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return skip.has(name) ? [] : walk(full)
      return BINARY.test(name) ? [] : [full]
    })
  const files = walk(root).map((f) => ({
    path: path.relative(root, f),
    content: readFileSync(f, 'utf8'),
  }))
  return { files: files.length, hits: findDenied(files, terms) }
}
