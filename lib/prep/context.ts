import { distortionSources } from '@/lib/ai/compose'
import { projectLine } from '@/lib/ai/projection'
import type { Person } from '@/lib/db/queries/people'
import type { PrepAnswer } from '@/lib/db/queries/prep'
import { formatSpan } from '@/lib/import/dates'
import { documentSpanish, type Market, type SpanishVariant } from '@/lib/markets'
import {
  type CVContent,
  CVContentSchema,
  type DocumentLanguage,
  type EvidenceItem,
  type EvidenceMapping,
  type MasterProfile,
  type Requirement,
} from '@/lib/schemas'
import { type OutcomeRow, type Round, roundOf } from './round'

/** What the prep is built from, already loaded (`loadPrepInput` reads it from the DB). */
export type PrepInput = {
  application: {
    id: string
    company: string
    jobTitle: string
    documentLanguage: DocumentLanguage
    market?: Market
    requirements: Requirement[]
    mappings: EvidenceMapping[]
    documents: unknown
    groundingReport: unknown
    outcomes: OutcomeRow[]
  }
  profile: MasterProfile
  evidence: EvidenceItem[]
  people: Person[]
  answers: PrepAnswer[]
  language?: DocumentLanguage
  eventId?: string
}

export type PrepContext = {
  applicationId: string
  company: string
  jobTitle: string
  requirements: (Requirement & { mapping: EvidenceMapping | null })[]
  evidence: EvidenceItem[]
  profile: MasterProfile
  cv: CVContent | null
  cvIsSnapshot: boolean
  flaggedBulletIds: string[]
  people: Person[]
  round: Round | null
  answers: PrepAnswer[]
  language: DocumentLanguage
  /** The Spanish a Spanish prep is spoken in: the application's market, else the person's. */
  spanish: SpanishVariant
  /** Cited id → the role/project/credential line it stands on, as the CV checker sees it. */
  extraSources: Map<string, string>
  /**
   * Requirement id → records that name its term though the analysis cited
   * none of them for it. The mapper is a model and misses: a posting's SQL was
   * once mapped to nothing while a BigQuery SQL record sat on file, unshown.
   */
  mentionedIn: Map<string, string[]>
}

/** Beyond what the mappings cite: his strongest records, newest first. */
const EXTRA_CORE_CAP = 30
/** Records shown per uncovered requirement because they name its term. */
const MENTION_CAP = 3

/**
 * A term as written in the posting, matched as a whole word. Case only bends
 * for an all-lowercase term ("n8n"): "Make" the platform must not match
 * "make" the verb, nor "SQL" a word that merely contains it.
 */
export function termPattern(term: string): RegExp {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flags = term === term.toLowerCase() ? 'iu' : 'u'
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags)
}

/** Hard requirements the analysis left uncovered or partial → records that name them anyway. */
export function uncitedMentions(
  requirements: Requirement[],
  mappings: EvidenceMapping[],
  evidence: EvidenceItem[],
): Map<string, string[]> {
  const mappingOf = new Map(mappings.map((m) => [m.requirementId, m]))
  const newestFirst = [...evidence].sort((a, b) =>
    (b.period.end ?? '9999-99').localeCompare(a.period.end ?? '9999-99'),
  )
  const out = new Map<string, string[]>()
  for (const r of requirements) {
    const m = mappingOf.get(r.id)
    if (r.kind !== 'hard' || (m && m.strength === 'strong')) continue
    const terms = [r.keyword, ...r.variants].filter((t) => t.trim().length > 1).map(termPattern)
    const cited = new Set(m?.evidenceIds ?? [])
    const ids = newestFirst
      .filter((e) => !cited.has(e.id))
      .filter((e) => terms.some((p) => p.test(e.text) || e.tags.some((tag) => p.test(tag))))
      .map((e) => e.id)
      .slice(0, MENTION_CAP)
    if (ids.length > 0) out.set(r.id, ids)
  }
  return out
}

const parseCv = (value: unknown): CVContent | null => {
  const parsed = CVContentSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function flaggedIds(report: unknown): string[] {
  const r = (report ?? {}) as {
    distortions?: { bulletId?: string }[]
    unsupportedClaims?: { bulletId?: string }[]
  }
  const ids = [...(r.distortions ?? []), ...(r.unsupportedClaims ?? [])]
    .map((x) => x.bulletId)
    .filter((id): id is string => typeof id === 'string' && id !== '')
  return [...new Set(ids)]
}

export function buildPrepContext(input: PrepInput, now: number = Date.now()): PrepContext {
  const { application: app } = input
  const docs = (app.documents ?? {}) as { cv?: unknown; sentCv?: unknown }
  const sent = parseCv(docs.sentCv)
  const cv = sent ?? parseCv(docs.cv)

  const mappingOf = new Map(app.mappings.map((m) => [m.requirementId, m]))
  const cited = new Set(app.mappings.flatMap((m) => m.evidenceIds))
  const citedItems = input.evidence.filter((e) => cited.has(e.id))
  const extraCore = input.evidence
    .filter((e) => !cited.has(e.id) && e.strength === 'core')
    .sort((a, b) => (b.period.end ?? '9999-99').localeCompare(a.period.end ?? '9999-99'))
    .slice(0, EXTRA_CORE_CAP)
  // A CV bullet's cited records are what "Defend your CV" stands on.
  const cvCited = new Set(
    cv
      ? [...cv.experience, ...cv.projects].flatMap((s) =>
          s.bullets.flatMap((b) => b.citedEvidenceIds),
        )
      : [],
  )
  const mentionedIn = uncitedMentions(app.requirements, app.mappings, input.evidence)
  const mentioned = new Set([...mentionedIn.values()].flat())
  const included = new Set([...citedItems, ...extraCore].map((e) => e.id))
  const cvItems = input.evidence.filter(
    (e) => (cvCited.has(e.id) || mentioned.has(e.id)) && !included.has(e.id),
  )
  const evidence = [...citedItems, ...extraCore, ...cvItems]

  const round = roundOf(app.outcomes, input.eventId, now)
  // The call's own people, plus anyone he added by hand (they belong to
  // whatever call he is preparing for).
  const ofEvent = round?.eventId
    ? input.people.filter(
        (p) => p.outcomeEventId === round.eventId || (p.source === 'manual' && !p.outcomeEventId),
      )
    : []

  return {
    applicationId: app.id,
    company: app.company,
    jobTitle: app.jobTitle,
    requirements: app.requirements.map((r) => ({ ...r, mapping: mappingOf.get(r.id) ?? null })),
    evidence,
    profile: input.profile,
    cv,
    cvIsSnapshot: sent !== null,
    flaggedBulletIds: flaggedIds(app.groundingReport),
    people: ofEvent.length > 0 ? ofEvent : input.people,
    round,
    answers: input.answers,
    language: input.language ?? app.documentLanguage,
    spanish: documentSpanish(app.market, input.profile.preferences.markets),
    extraSources: distortionSources(input.profile, evidence),
    mentionedIn,
  }
}

const esc = (s: string) => s.replace(/[<>]/g, ' ')
/** Free text inside an attribute: a quote mark would end it early. */
const attr = (s: string) => esc(s).replaceAll('"', '&quot;')

function evidenceLine(e: EvidenceItem, profile: MasterProfile): string {
  const metrics = e.metrics.map((m) => m.raw).join(' ; ')
  const role =
    e.sourceRef.type === 'project'
      ? (() => {
          const p = profile.projects.find((x) => x.id === e.sourceRef.id)
          return p ? `[project] ${projectLine(p)}` : ''
        })()
      : e.sourceRef.type === 'experience'
        ? (() => {
            const r = profile.experience.find((x) => x.id === e.sourceRef.id)
            return r ? `[role] ${r.title} at ${r.company} | ${formatSpan(r.period, 'present')}` : ''
          })()
        : ''
  return `<record id="${e.id}" kind="${e.kind}">${esc(e.text)}${metrics ? ` (metrics: ${esc(metrics)})` : ''}${role ? `\n  ${esc(role)}` : ''}</record>`
}

/** The model's view of everything the prep may stand on. Ids are the only handles it cites. */
export function renderPrepPayload(ctx: PrepContext): string {
  const reqs = ctx.requirements
    .map(
      (r) =>
        `<requirement id="${r.id}" kind="${r.kind}" mandatory="${r.mandatory}" weight="${r.weight}" coverage="${r.mapping?.strength ?? 'none'}" evidence="${(r.mapping?.evidenceIds ?? []).join(',')}"${ctx.mentionedIn.has(r.id) ? ` also_named_in="${(ctx.mentionedIn.get(r.id) ?? []).join(',')}"` : ''}>${esc(r.text)}</requirement>`,
    )
    .join('\n')
  const evidence = ctx.evidence.map((e) => evidenceLine(e, ctx.profile)).join('\n')
  const flagged = new Set(ctx.flaggedBulletIds)
  const cv = ctx.cv
    ? [
        `<sent_cv title="${attr(ctx.cv.header.title)}">`,
        ctx.cv.summary ? `<summary>${esc(ctx.cv.summary)}</summary>` : '',
        ...[
          ...ctx.cv.experience.map((r) => ({
            head: `${r.title} at ${r.company}`,
            bullets: r.bullets,
          })),
          ...ctx.cv.projects.map((p) => ({ head: `${p.name} (own project)`, bullets: p.bullets })),
        ].flatMap((s) => [
          `<section>${esc(s.head)}</section>`,
          ...s.bullets.map(
            (b) =>
              `<bullet id="${b.id}" cites="${b.citedEvidenceIds.join(',')}"${flagged.has(b.id) ? ' flagged="true"' : ''}>${esc(b.text)}</bullet>`,
          ),
        ]),
        '</sent_cv>',
      ]
        .filter(Boolean)
        .join('\n')
    : '<sent_cv>none on file</sent_cv>'
  const round = ctx.round
    ? `round: ${ctx.round.kind === 'screen' ? 'screening call' : `interview round ${ctx.round.n}`}${ctx.round.scheduledAt ? ` on ${ctx.round.scheduledAt}` : ''}`
    : 'round: unknown'
  const people =
    ctx.people.length > 0
      ? ctx.people
          .map((p) => `- ${esc(p.name)} — ${p.role ? esc(p.role) : 'role unknown'}`)
          .join('\n')
      : '- nobody named yet'
  const answers =
    ctx.answers.length > 0
      ? ctx.answers
          .map(
            (a) =>
              `<answer id="answer:${a.id}" part="${a.part}" about="${a.evidenceIds.join(',')}" question="${attr(a.question)}">${esc(a.answer)}</answer>`,
          )
          .join('\n')
      : ''
  return [
    `<job company="${attr(ctx.company)}" title="${attr(ctx.jobTitle)}" output_language="${ctx.language}" />`,
    `<requirements>\n${reqs}\n</requirements>`,
    `<evidence>\n${evidence}\n</evidence>`,
    cv,
    `<interview>\n${round}\n${people}\n</interview>`,
    `<his_answers>\n${answers}\n</his_answers>`,
  ].join('\n\n')
}
