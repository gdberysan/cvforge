import { randomUUID } from 'node:crypto'
import type { Experience, ParsedCV } from '@/lib/schemas'

/**
 * Re-imports must not shuffle evidence between roles. The parser numbers
 * roles by position ("exp_1", "exp_2"…), so a new CV with the roles in a
 * different order would silently re-attach every kept interviewed/manual
 * record — recorded under the old ids — to whichever role now sits at that
 * position. Match each incoming role to an existing one (same normalized
 * company, overlapping period) and keep the existing id for matches; an
 * unmatched role never takes an id an existing role owns.
 */
export function reconcileImport(existing: Experience[], parsed: ParsedCV): ParsedCV {
  if (existing.length === 0) return parsed

  const consumed = new Set<string>()
  const idMap = new Map<string, string>()

  // Two passes, not one greedy one. Two stints at one company are two roles,
  // and the stint with the identical start IS the original: in a single pass
  // a later, merely overlapping stint that came first in the new CV took the
  // original's id, and every record under it moved to the wrong job.
  const sameCompany = (r: Experience, incoming: Experience) =>
    !consumed.has(r.id) && normalizeCompany(r.company) === normalizeCompany(incoming.company)
  const pair = (incoming: Experience, match: Experience | undefined) => {
    if (!match) return
    consumed.add(match.id)
    idMap.set(incoming.id, match.id)
  }
  for (const incoming of parsed.profile.experience) {
    pair(
      incoming,
      existing.find((r) => sameCompany(r, incoming) && r.period.start === incoming.period.start),
    )
  }
  for (const incoming of parsed.profile.experience) {
    if (idMap.has(incoming.id)) continue
    pair(
      incoming,
      existing.find((r) => sameCompany(r, incoming) && overlaps(r, incoming)),
    )
  }

  // An unmatched incoming role keeps its parsed id unless an existing role
  // owns it — evidence recorded under that id means the OTHER role.
  const taken = new Set([...consumed, ...existing.map((r) => r.id)])
  for (const incoming of parsed.profile.experience) {
    if (idMap.has(incoming.id)) continue
    if (taken.has(incoming.id)) idMap.set(incoming.id, `exp_${randomUUID().slice(0, 8)}`)
  }

  const mapped = (id: string) => idMap.get(id) ?? id
  return {
    profile: {
      ...parsed.profile,
      experience: parsed.profile.experience.map((r) => ({ ...r, id: mapped(r.id) })),
    },
    evidence: parsed.evidence.map((e) =>
      e.sourceRef.type === 'experience'
        ? { ...e, sourceRef: { ...e.sourceRef, id: mapped(e.sourceRef.id) } }
        : e,
    ),
  }
}

/**
 * Trailing legal forms, matched after dots and commas are gone: "S.A. de
 * C.V." reads "sa de cv", "S. de R.L." reads "s de rl". A CV and a LinkedIn
 * export rarely agree on whether to print them.
 */
const LEGAL_FORM =
  / (sa de cv|sapi de cv|sab de cv|s de rl de cv|s de rl|sa|sapi|sas|sl|srl|inc|llc|ltd|limited|gmbh|ag|bv|plc|corp|corporation|co)$/

function normalizeCompany(name: string): string {
  let n = name
    .normalize('NFD')
    // Combining marks — MUST stay as a unicode escape; literals get mangled.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Strip repeatedly ("Acme Holdings Inc LLC"), but never down to nothing:
  // "Inc." alone is a name, not a suffix.
  while (true) {
    const stripped = n.replace(LEGAL_FORM, '')
    if (stripped === n || stripped.length === 0) return n
    n = stripped
  }
}

/** YYYY-MM strings order lexicographically; an open end means "still there". */
function overlaps(a: Experience, b: Experience): boolean {
  const aEnd = a.period.end ?? '9999-12'
  const bEnd = b.period.end ?? '9999-12'
  return a.period.start <= bEnd && b.period.start <= aEnd
}
