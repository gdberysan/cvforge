import { formatSpan } from '@/lib/import/dates'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'

/**
 * A compact, deterministic view of the career for stage ② (map-evidence).
 *
 * Two properties matter more than readability:
 *  - Byte-stable. This sits behind a cache_control breakpoint, so any ordering
 *    nondeterminism destroys every cache hit and costs real money.
 *  - Narrow. Contact details and links are useless for mapping and would
 *    otherwise sit in the cached prefix of every request.
 */
export function buildEvidenceProjection(profile: MasterProfile, evidence: EvidenceItem[]): string {
  const roles = [...profile.experience]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (r) => `${r.id} | ${r.title} @ ${r.company} | ${r.period.start}–${r.period.end ?? 'present'}`,
    )

  const skills = [...profile.skills]
    .sort((a, b) => a.category.localeCompare(b.category))
    .map((s) => `${s.category}: ${[...s.items].sort().join(', ')}`)

  const items = [...evidence]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) =>
      [
        `${e.id} [${e.kind}] source=${e.sourceRef.type}:${e.sourceRef.id} strength=${e.strength}`,
        `  period: ${e.period.start}–${e.period.end ?? 'present'}`,
        `  tags: ${[...e.tags].sort().join(', ') || '(none)'}`,
        `  metrics: ${e.metrics.map((m) => m.raw).join(' ; ') || '(none)'}`,
        `  text: ${e.text}`,
      ].join('\n'),
    )

  // Profile facts that are not achievements but are legitimately citable —
  // a posting that requires a certification, a degree, or a language must be
  // able to map to them. Each carries an id the model can return.
  const credentials = buildCredentialLines(profile)

  return [
    '<career>',
    `headline: ${profile.basics.headline}`,
    `target titles: ${[...profile.preferences.targetTitles].sort().join(', ') || '(none)'}`,
    `location: ${profile.basics.location} (${profile.basics.timezone})`,
    `work authorization: ${
      profile.workAuthorization
        .map((w) => `${w.country}:${w.status}`)
        .sort()
        .join(', ') || '(none)'
    }`,
    '',
    '<roles>',
    ...roles,
    '</roles>',
    '',
    '<skills>',
    ...skills,
    '</skills>',
    '',
    '<evidence>',
    ...items,
    '</evidence>',
    // Omitted when empty: an empty block would still change the bytes, and the
    // projection is hashed for staleness — emitting it flips every hash stored
    // before credentials existed and re-runs the paid mapping stage for nothing.
    ...(credentials.length > 0 ? ['', '<credentials>', ...credentials, '</credentials>'] : []),
    '</career>',
  ].join('\n')
}

/**
 * Certification, education, and language lines citable by id — shared
 * between the evidence-mapping projection and the CV composer, so both
 * ground identically and a fix to one can't silently drift from the other.
 */
export function buildCredentialLines(profile: MasterProfile): string[] {
  return [
    ...profile.certifications.map(
      (c) =>
        `${c.id} | certification | ${c.name}${c.issuer ? ` — ${c.issuer}` : ''}${c.date ? ` | ${c.date}` : ''}`,
    ),
    ...profile.education.map((e) =>
      // An undated degree drops the date column rather than printing an
      // empty one the composer might fill in.
      [
        `${e.id} | education | ${[e.degree, e.institution].filter(Boolean).join(' — ')}`,
        formatSpan(e.period, 'present'),
      ]
        .filter(Boolean)
        .join(' | '),
    ),
    ...languageIds(profile.languages).map(
      (id, i) =>
        `${id} | language | ${profile.languages[i].language} — ${profile.languages[i].level}`,
    ),
  ].sort()
}

/** Stable id for a language line: "Inglés" → "lang_ingles". */
function languageId(language: string): string {
  const slug = language
    .normalize('NFD')
    // Combining marks — MUST stay as unicode escapes; literals get mangled.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `lang_${slug}`
}

/**
 * Distinct ids for the whole languages array — one id per line, always.
 * A slug that vanishes (non-Latin scripts) falls back to the position, and a
 * colliding slug ("Inglés" then "ingles") takes a positional suffix; either
 * repeat would be an ambiguous citation findUnknownIds cannot catch. Both the
 * projection and citableIds go through this so they always agree.
 */
function languageIds(languages: { language: string }[]): string[] {
  const seen = new Map<string, number>()
  return languages.map((l, i) => {
    const base = languageId(l.language)
    const id = base === 'lang_' ? `lang_${i + 1}` : base
    const taken = seen.get(id) ?? 0
    seen.set(id, taken + 1)
    return taken === 0 ? id : `${id}_${taken + 1}`
  })
}

/**
 * Every id the mapper may cite: evidence records plus the credential lines
 * of the projection. The mapper rejects anything outside this set.
 */
export function citableIds(profile: MasterProfile, evidence: EvidenceItem[]): Set<string> {
  return new Set([
    ...evidence.map((e) => e.id),
    ...profile.certifications.map((c) => c.id),
    ...profile.education.map((e) => e.id),
    ...languageIds(profile.languages),
  ])
}

/**
 * Every proper noun the user can legitimately claim. Phase 3's grounding
 * checks use this to flag entities appearing in a generated bullet that exist
 * nowhere in the profile.
 */
export function buildEntityIndex(profile: MasterProfile, evidence: EvidenceItem[]): Set<string> {
  const index = new Set<string>()
  const add = (value: string | undefined) => {
    const v = value?.trim().toLowerCase()
    if (v) index.add(v)
  }

  for (const role of profile.experience) {
    add(role.company)
    add(role.title)
  }
  for (const group of profile.skills) {
    add(group.category)
    group.items.forEach(add)
  }
  for (const edu of profile.education) {
    add(edu.institution)
    add(edu.degree)
  }
  for (const cert of profile.certifications) {
    add(cert.name)
    add(cert.issuer)
  }
  for (const project of profile.projects) {
    add(project.name)
    project.stack.forEach(add)
  }
  for (const item of evidence) {
    item.tags.forEach(add)
  }
  profile.preferences.targetTitles.forEach(add)

  return index
}
