import { manualId } from '@/lib/manual-id'
import type { EvidenceItem, Experience, MasterProfile, ParsedCV } from '@/lib/schemas'

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
    if (taken.has(incoming.id)) idMap.set(incoming.id, manualId('exp'))
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

/**
 * A re-import merged into what the person already has, never laid over it
 * (2026-11-19 audit). The CV is the authority for what a CV states; it is no
 * authority for what it never states, nor for what the person built here:
 *
 * - work authorization, preferences and time zone are always the person's;
 * - roles are matched as reconcileImport does; projects, degrees and
 *   certificates by name, so kept evidence stays on its own record when the
 *   new CV numbers them differently;
 * - every project the new CV leaves out is kept (projects are made by hand
 *   on /evidence), and so is any role, degree or certificate the person's
 *   own evidence (interview, gap-fill, manual) points at — a CV dropping it
 *   must not orphan that evidence, which compose would then silently drop;
 * - what is left of the previous import (records nothing kept points at) is
 *   replaced, as before.
 *
 * `kept` is the evidence that survives the import: everything not imported.
 */
export function mergeImport(
  current: MasterProfile,
  kept: EvidenceItem[],
  parsed: ParsedCV,
): ParsedCV {
  const roles = reconcileImport(current.experience, parsed)
  const claimed = (type: EvidenceItem['sourceRef']['type']) =>
    new Set(kept.filter((e) => e.sourceRef.type === type).map((e) => e.sourceRef.id))

  const projects = matchByName(current.projects, roles.profile.projects, (p) => p.name, 'proj')
  const education = matchByName(
    current.education,
    roles.profile.education,
    (e) => `${e.institution} ${e.degree}`,
    'edu',
  )
  const certifications = matchByName(
    current.certifications,
    roles.profile.certifications,
    (c) => c.name,
    'cert',
  )

  const keptRoles = claimed('experience')
  const matchedRoles = new Set(roles.profile.experience.map((r) => r.id))
  const keptEducation = claimed('education')
  const keptCerts = claimed('certification')

  const remap = (type: EvidenceItem['sourceRef']['type'], id: string) =>
    type === 'project'
      ? (projects.idMap.get(id) ?? id)
      : type === 'education'
        ? (education.idMap.get(id) ?? id)
        : type === 'certification'
          ? (certifications.idMap.get(id) ?? id)
          : id

  return {
    profile: {
      ...roles.profile,
      basics: { ...roles.profile.basics, timezone: current.basics.timezone },
      workAuthorization: current.workAuthorization,
      preferences: current.preferences,
      experience: [
        ...roles.profile.experience,
        ...current.experience.filter((r) => !matchedRoles.has(r.id) && keptRoles.has(r.id)),
      ],
      projects: [...projects.merged, ...projects.unmatched],
      education: [
        ...education.merged,
        ...education.unmatched.filter((e) => keptEducation.has(e.id)),
      ],
      certifications: [
        ...certifications.merged,
        ...certifications.unmatched.filter((c) => keptCerts.has(c.id)),
      ],
    },
    evidence: roles.evidence.map((e) => ({
      ...e,
      sourceRef: { ...e.sourceRef, id: remap(e.sourceRef.type, e.sourceRef.id) },
    })),
  }
}

/**
 * Incoming records matched to existing ones by normalised name: a match
 * takes the existing id; an unmatched one keeps its parsed id unless an
 * existing record owns it (evidence under that id means the other record).
 * `unmatched` is the existing records the new CV does not name.
 */
function matchByName<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  name: (r: T) => string,
  prefix: string,
): { merged: T[]; unmatched: T[]; idMap: Map<string, string> } {
  const key = (r: T) => normalizeCompany(name(r))
  const consumed = new Set<string>()
  const idMap = new Map<string, string>()
  for (const r of incoming) {
    const match = existing.find((e) => !consumed.has(e.id) && key(e) === key(r))
    if (match) {
      consumed.add(match.id)
      idMap.set(r.id, match.id)
    }
  }
  const taken = new Set(existing.map((e) => e.id))
  for (const r of incoming) {
    if (!idMap.has(r.id) && taken.has(r.id)) idMap.set(r.id, manualId(prefix))
  }
  return {
    merged: incoming.map((r) => ({ ...r, id: idMap.get(r.id) ?? r.id })),
    unmatched: existing.filter((e) => !consumed.has(e.id)),
    idMap,
  }
}
