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
