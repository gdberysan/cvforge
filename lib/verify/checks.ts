import { buildEntityIndex, credentialSources } from '@/lib/ai/projection'
import { dollarSignCurrency } from '@/lib/markets'
import type { CVContent, EvidenceItem, GroundingReport, Market, MasterProfile } from '@/lib/schemas'
import { educationLineId, roleTitleId } from './line-text'
import {
  extractCounts,
  extractQuantities,
  extractYearSpans,
  normaliseQuantity,
  numbersIn,
} from './quantities'
import { checkSections, educationRecordOf, recordedYears, sectionLines } from './sections'

/** Capitalised words and obvious tech tokens. Sentence-initial words are skipped. */
function extractEntities(text: string): string[] {
  const words = text.split(/\s+/)
  const entities: string[] = []

  words.forEach((raw, i) => {
    // A sentence-final period and a possessive are punctuation, not part of
    // a name: "rate." read as a tech token and "Mexico's" as an unknown name.
    const word = raw
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#.]+$/gu, '')
      .replace(/\.+$/, '')
      .replace(/['’]s$/u, '')
    if (word.length < 2) return
    // A multiplier ("8x") is a figure, checked against the metrics already.
    if (/^\d+(?:[.,]\d+)?[x×]$/iu.test(word)) return
    if (i === 0) return // sentence-initial capitalisation carries no signal
    const isCapitalised = /^\p{Lu}/u.test(word)
    const isTechToken = /[0-9+#.]/.test(word) && /\p{L}/u.test(word)
    if (isCapitalised || isTechToken) entities.push(word)
  })

  return entities
}

const COMMON_WORDS = new Set([
  'i',
  'a',
  'the',
  'and',
  'or',
  'for',
  'with',
  'led',
  'built',
  'drove',
  'cut',
  'grew',
  'reduced',
  'increased',
  'delivered',
  'managed',
  'designed',
  'shipped',
  'owned',
])

/**
 * The half of the grounding promise that costs nothing and cannot be talked
 * out of its answer: citations, quantities, and entities verified in plain
 * code, no model call. Unknown entities are a soft signal — they flag for
 * review but do not fail the report; invented numbers and bad citations do.
 *
 * Covers the whole CV, not just the bullets: the summary cites and is checked
 * as a bullet under the id 'summary'; title, skills, education and extras are
 * held to the record by checkSections. A badge that says every claim is
 * traced must not be true only of the bullets.
 */
export function runDeterministicChecks(args: {
  cv: CVContent
  evidence: EvidenceItem[]
  profile: MasterProfile
  selectedEvidenceIds: Set<string>
  postingVocabulary?: Set<string>
  /** Lower-cased keyword (or variant) of a requirement that mapped to
   *  nothing, mapped to that requirement's own text — the free-text
   *  rationale a claimed-gap flag shows, the same way the AI
   *  distortion-check quotes conflicting source wording. */
  knownGaps?: Map<string, string>
  /** Keywords and variants of requirements the evidence supports (strong or
   *  partial) — posting wording a skills line may mirror. */
  supportedTerms?: Set<string>
  /** A base CV's focus; the header may carry it. */
  targetTitle?: string
  /** A tailored CV's posting title; the header may not carry it unless held. */
  soughtTitle?: string
  /** The CV's market: it says which currency a bare "$" reads as. */
  market?: Market
}): GroundingReport {
  const report: GroundingReport = {
    uncitedBullets: [],
    invalidCitations: [],
    unverifiedNumbers: [],
    unknownEntities: [],
    distortions: [],
    claimedGaps: [],
    unsupportedClaims: [],
    passed: true,
  }

  const evidenceById = new Map(args.evidence.map((e) => [e.id, e]))
  const entityIndex = buildEntityIndex(args.profile, args.evidence)
  const posting = args.postingVocabulary ?? new Set<string>()
  const gapMatchers = [...(args.knownGaps ?? new Map())].map(
    ([keyword, requirementText]) => [keyword, requirementText, wholeWord(keyword)] as const,
  )

  const credentials = credentialSources(args.profile)
  const careerYears = recordedYears(args.profile.experience.map((r) => r.period))

  // Every bullet with the section it sits in. Roles, projects and the summary
  // are checked by one loop so they can never drift apart. The summary may
  // also cite a credential ("Licenciada en Mercadotecnia…").
  const sections = [
    ...(args.cv.summary.trim()
      ? [
          {
            kind: 'summary' as const,
            bullets: [
              {
                id: 'summary',
                text: args.cv.summary,
                citedEvidenceIds: args.cv.summaryCitedEvidenceIds ?? [],
              },
            ],
          },
        ]
      : []),
    ...args.cv.experience.map((role) => ({ kind: 'experience' as const, bullets: role.bullets })),
    ...(args.cv.projects ?? []).map((project) => ({
      kind: 'project' as const,
      id: project.projectId,
      bullets: project.bullets,
    })),
  ]

  for (const section of sections) {
    for (const bullet of section.bullets) {
      // 0. A known gap asserted as an achievement. Checked before anything
      // else because it is independent of citations — a bullet can cite real
      // evidence and still smuggle in the one skill the analysis said is missing.
      for (const [keyword, requirementText, matcher] of gapMatchers) {
        if (matcher.test(bullet.text))
          report.claimedGaps.push({ bulletId: bullet.id, keyword, requirementText })
      }

      // 1. Citation presence.
      if (bullet.citedEvidenceIds.length === 0) {
        report.uncitedBullets.push(bullet.id)
        continue
      }

      // 2. Citation validity — must exist AND have been selected for composition.
      const citedItems: EvidenceItem[] = []
      const citedCredentials: string[] = []
      for (const id of bullet.citedEvidenceIds) {
        const credential = section.kind === 'summary' ? credentials.get(id) : undefined
        if (credential !== undefined) {
          citedCredentials.push(credential)
          continue
        }
        const item = evidenceById.get(id)
        if (!item || !args.selectedEvidenceIds.has(id)) {
          report.invalidCitations.push({ bulletId: bullet.id, evidenceId: id })
        } else if (section.kind !== 'summary' && misattributed(item, section)) {
          // Self-built work printed under an employer is the invented-employer
          // lie by another route; role work under a project is its mirror.
          report.invalidCitations.push({ bulletId: bullet.id, evidenceId: id })
        } else {
          citedItems.push(item)
        }
      }

      // 3. Every quantity must exist in a cited item's metrics or text, unit
      // and currency included. EXACT equality after normalisation: substring
      // matching once let an invented $80k pass against a recorded $180k —
      // the one class of fabrication this check exists to catch. Metric raws
      // and record text carry prose ("subí ROAS 3.4x"), so their quantities
      // are extracted the same way the bullet's are before comparing.
      const allowed = allowedQuantityForms(citedItems)
      for (const line of citedCredentials)
        for (const token of extractQuantities(line)) allowed.add(normaliseQuantity(token))
      for (const token of extractQuantities(bullet.text)) {
        if (
          !allowed.has(normaliseQuantity(token)) ||
          dollarSignSwapsCurrency(token, citedItems, args.market)
        ) {
          report.unverifiedNumbers.push({ bulletId: bullet.id, token })
        }
      }

      // 3b. Bare counts ("a team of 6", "+200 clientes") must be stated in
      // what the line cites, and a span of years may not exceed the time on
      // record: the cited records' own periods for a bullet, the whole career
      // for the summary.
      const stated = numbersIn(
        [
          ...citedItems.flatMap((item) => [
            item.text,
            ...item.metrics.map((m) => `${m.raw} ${m.value ?? ''}`),
          ]),
          ...citedCredentials,
        ].join('\n'),
      )
      for (const count of extractCounts(bullet.text)) {
        if (!stated.has(count))
          report.unverifiedNumbers.push({ bulletId: bullet.id, token: `${count}` })
      }
      const span =
        section.kind === 'summary'
          ? careerYears
          : recordedYears(citedItems.map((item) => item.period))
      for (const years of extractYearSpans(bullet.text)) {
        if (years > Math.round(span) && !stated.has(years))
          report.unverifiedNumbers.push({ bulletId: bullet.id, token: `${years}` })
      }

      // 4. Entity index — soft signal only.
      for (const entity of extractEntities(bullet.text)) {
        const lower = entity.toLowerCase()
        if (COMMON_WORDS.has(lower)) continue
        if (entityIndex.has(lower) || posting.has(lower)) continue
        if (citedItems.some((item) => item.text.toLowerCase().includes(lower))) continue
        if (citedCredentials.some((line) => line.toLowerCase().includes(lower))) continue
        report.unknownEntities.push({ bulletId: bullet.id, entity })
      }
    }
  }

  const rest = checkSections({
    cv: args.cv,
    profile: args.profile,
    evidence: args.evidence,
    supportedTerms: args.supportedTerms ?? new Set(),
    targetTitle: args.targetTitle,
    soughtTitle: args.soughtTitle,
    gapMatchers,
    recordedQuantities: new Set([
      ...allowedQuantityForms(args.evidence),
      ...[...credentials.values()].flatMap((line) =>
        extractQuantities(line).map(normaliseQuantity),
      ),
    ]),
  })
  report.claimedGaps.push(...rest.claimedGaps)
  report.unverifiedNumbers.push(...rest.unverifiedNumbers)
  report.unsupportedClaims.push(...rest.unsupportedClaims)

  report.passed = codeChecksPassed(report)

  return report
}

/** Every hard failure the code checks can find — the model's distortions aside. */
export function codeChecksPassed(report: GroundingReport): boolean {
  return (
    report.uncitedBullets.length === 0 &&
    report.invalidCitations.length === 0 &&
    report.unverifiedNumbers.length === 0 &&
    report.claimedGaps.length === 0 &&
    report.unsupportedClaims.length === 0
  )
}

/** Ids of the lines the code checks failed; only the rest are worth a model call. */
export function codeFailedIds(report: GroundingReport): Set<string> {
  return new Set([
    ...report.uncitedBullets,
    ...report.invalidCitations.map((c) => c.bulletId),
    ...report.unverifiedNumbers.map((n) => n.bulletId),
    ...report.claimedGaps.map((g) => g.bulletId),
  ])
}

/** The id a skills or extras line cites to stand on the person's own skills list. */
export const PROFILE_SKILLS_ID = 'profile:skills'

/**
 * The lines the model's distortion check judges: every bullet, the summary
 * when there is one, and the skills and free-text extras (see sectionLines),
 * which stand on the person's skills list, their certifications ("Apple
 * Search Ads" is a skill a certificate on file demonstrates) and every
 * evidence record the CV was allowed to draw on. Shared by compose and the
 * base-CV re-check so the two always send the same set; every caller's
 * sources carry the credential lines and the recorded role titles
 * (`distortionSources`).
 *
 * A role title that is not the recorded one (a translation, or an inflation)
 * is judged too, against that role's record alone: no code check can tell
 * "Gerente de Marketing" from a promotion. The recorded title itself costs
 * no call.
 */
export function verifiableLines(
  cv: CVContent,
  profile: MasterProfile,
  selectedEvidenceIds: Iterable<string>,
): { id: string; text: string; citedEvidenceIds: string[] }[] {
  const everything = [
    PROFILE_SKILLS_ID,
    ...profile.certifications.map((c) => c.id),
    ...selectedEvidenceIds,
  ]
  const recordedTitle = new Map(profile.experience.map((r) => [r.id, sameText(r.title)]))
  return [
    ...(cv.summary.trim()
      ? [{ id: 'summary', text: cv.summary, citedEvidenceIds: cv.summaryCitedEvidenceIds ?? [] }]
      : []),
    ...cv.experience
      .filter((role) => recordedTitle.get(role.experienceId) !== sameText(role.title))
      .map((role) => ({
        id: roleTitleId(role.experienceId),
        text: role.title,
        citedEvidenceIds: [roleTitleSourceId(role.experienceId)],
      })),
    ...[...cv.experience, ...(cv.projects ?? [])].flatMap((section) => section.bullets),
    ...sectionLines(cv, profile).map((line) => ({ ...line, citedEvidenceIds: everything })),
    // A degree worded unlike its record (a translation, or a broader field):
    // the code only rules out a higher level, so the model judges the rest,
    // against that record alone.
    ...cv.education.flatMap((entry, i) => {
      const record = educationRecordOf(profile, entry)
      if (!record || !entry.degree.trim() || sameText(entry.degree) === sameText(record.degree))
        return []
      return [
        {
          id: educationLineId(i),
          text: [entry.degree, entry.institution].filter((s) => s.trim()).join(' — '),
          citedEvidenceIds: [degreeSourceId(record.id)],
        },
      ]
    }),
  ]
}

const sameText = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** The source a printed degree is judged against: that education record. */
export function degreeSourceId(educationId: string): string {
  return `profile:degree-${educationId}`
}

/** One source per recorded degree, for the distortion check of its wording. */
export function degreeSources(profile: MasterProfile): [string, string][] {
  return profile.education.map((e) => [
    degreeSourceId(e.id),
    `The recorded degree: "${e.degree}" at ${e.institution || '(no institution recorded)'}. The text is supported only when it is that degree or a faithful translation of it into another language, at no higher level, in no broader or different field, and with no honours or distinction the record does not state; wording that differs only by language is supported.`,
  ])
}

/** The source a role title is judged against: that role's record. */
export function roleTitleSourceId(experienceId: string): string {
  return `profile:role-title-${experienceId}`
}

/** One source per recorded role, for the distortion check of its title. */
export function roleTitleSources(profile: MasterProfile): [string, string][] {
  return profile.experience.map((r) => [
    roleTitleSourceId(r.id),
    `The recorded title of this role: "${r.title}" at ${r.company}. The text is supported only when it is that title or a faithful translation of it into another language, claiming no more seniority, scope, ownership or specialty; wording that differs only by language is supported.`,
  ])
}

/**
 * The person's own statements as one distortion source: their skills list,
 * project stacks, and the profile facts a CV's extras print — where they
 * live, their links, languages and work authorization. Never the markets
 * they target: a preference is not experience, and "US markets" must not
 * pass on it. Without these the checker flagged the
 * person's own location, LinkedIn and "English — C1" as unsupported on most
 * saved CVs.
 */
export function profileSkillsLine(profile: MasterProfile): string {
  const skills = profile.skills.map((g) => `${g.category}: ${g.items.join(', ')}`).join(' | ')
  const stacks = profile.projects.flatMap((p) => p.stack)
  const b = profile.basics
  const facts = [
    b.location.trim() ? `location: ${b.location.trim()}` : '',
    b.links.length ? `links: ${b.links.map((l) => l.url).join(', ')}` : '',
    profile.languages.length
      ? `languages: ${profile.languages.map((l) => `${l.language} (${l.level})`).join(', ')}`
      : '',
    profile.workAuthorization.length
      ? `work authorization: ${profile.workAuthorization.map((w) => `${w.country} — ${w.status}`).join(', ')}`
      : '',
  ].filter(Boolean)
  return [
    `skills the person listed — ${skills || '(none)'}`,
    stacks.length ? `project stacks: ${stacks.join(', ')}` : '',
    facts.length ? `profile — ${facts.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ')
}

/**
 * A citation that is real and selected but sits in the wrong kind of section:
 * project evidence under a role, or anything but that project's own evidence
 * under a project. Role-to-role placement is left alone on purpose — the
 * mapper and composer have always been free to group a role's work, and a new
 * failure there would be a behaviour change no posting asked for.
 */
export function misattributed(
  item: EvidenceItem,
  section: { kind: 'experience' } | { kind: 'project'; id: string },
): boolean {
  if (section.kind === 'experience') return item.sourceRef.type === 'project'
  return item.sourceRef.type !== 'project' || item.sourceRef.id !== section.id
}

/**
 * Every normalised quantity a set of cited items can support: what their
 * metrics record and what their text states. The text counts because it is
 * the person's own statement (typed, imported from their CV, or written from
 * interview answers whose figures were checked against what they said —
 * `stripUngroundedMetrics`). Metrics-only flagged "100% automatizada" against
 * a record reading "100% automatizado", and the repair deleted a true line.
 */
export function allowedQuantityForms(citedItems: EvidenceItem[]): Set<string> {
  const stated = citedItems.flatMap((item) => extractQuantities(item.text).map(normaliseQuantity))
  return new Set([
    ...stated,
    ...citedItems.flatMap((item) =>
      item.metrics.flatMap((m) => {
        const forms = extractQuantities(m.raw).map(normaliseQuantity)
        if (m.value !== undefined) {
          if (m.unit) forms.push(normaliseQuantity(`${m.value}${m.unit}`))
          // A money metric stores its currency beside the value, with or
          // without a unit: "$1.2M" parsed from the editor has currency MXN
          // and no unit at all. Both the code-explicit form the composer is
          // invited to write ("1.2M MXN") and the bare figure are honest.
          if (m.currency) {
            forms.push(normaliseQuantity(`${m.value}${m.currency}`))
            forms.push(normaliseQuantity(`${m.value}`))
          }
        }
        return forms
      }),
    ),
  ])
}

/**
 * A bare "$" figure reads as the market's currency: pesos on a Mexico CV,
 * dollars on any other (2026-11-19 audit: "$1.2M" passed against a 1.2M MXN
 * record on a US CV, about 17 times the money). It swaps the currency when a
 * cited record states that value in another currency and none states it in
 * the market's. A figure whose currency was never recorded is the person's
 * own wording, and is not flagged.
 */
function dollarSignSwapsCurrency(
  token: string,
  citedItems: EvidenceItem[],
  market: Market | undefined,
): boolean {
  if (!market || !/^\$/.test(token.trim()) || /[a-z]{3}/i.test(token)) return false
  const readAs = dollarSignCurrency(market)
  const value = normaliseQuantity(token)
  const currencies = citedItems.flatMap((item) =>
    item.metrics.flatMap((m) =>
      m.value !== undefined && m.currency && normaliseQuantity(`${m.value}`) === value
        ? [m.currency]
        : [],
    ),
  )
  return currencies.length > 0 && !currencies.includes(readAs)
}

/** Whole-word, case-insensitive, Unicode-aware — "SQLite" is not a claim of "SQL". */
export function wholeWord(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu')
}
