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

  for (const incoming of parsed.profile.experience) {
    const candidates = existing.filter(
      (r) =>
        !consumed.has(r.id) &&
        normalizeCompany(r.company) === normalizeCompany(incoming.company) &&
        overlaps(r, incoming),
    )
    // Two stints at one company are two roles: prefer the identical start.
    const match = candidates.find((r) => r.period.start === incoming.period.start) ?? candidates[0]
    if (match) {
      consumed.add(match.id)
      idMap.set(incoming.id, match.id)
    }
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

const normalizeCompany = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** YYYY-MM strings order lexicographically; an open end means "still there". */
function overlaps(a: Experience, b: Experience): boolean {
  const aEnd = a.period.end ?? '9999-12'
  const bEnd = b.period.end ?? '9999-12'
  return a.period.start <= bEnd && b.period.start <= aEnd
}
