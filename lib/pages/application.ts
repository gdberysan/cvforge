/**
 * Everything one application's screen reads, as plain data (see
 * lib/pages/home.ts): the desktop page calls this with its database, the
 * web edition's Worker with its own. Step-specific reads happen only for the
 * step on screen, as before. The job agent's mail is passed in by the
 * personal desktop build, so this module never loads the agent.
 */
import { z } from 'zod'
import { kitPhaseFor } from '#satellite'
import type { ChipRequirement } from '@/components/application/RequirementChips'
import type { PrepView } from '@/components/prep/PrepStep'
import { buildEvidenceProjection } from '@/lib/ai/projection'
import {
  currentStep,
  nextStep,
  resolveStep,
  type Step,
  stepStates,
  visibleSteps,
} from '@/lib/application-steps'
import type { Db } from '@/lib/db/client'
import {
  type ApplicationRecord,
  getApplication,
  listOpenOutcomeLogs,
  listOutcomes,
} from '@/lib/db/queries/applications'
import { listVariants } from '@/lib/db/queries/cv-variants'
import { latestDraft, listUsedDrafts } from '@/lib/db/queries/drafts'
import { listEvidence } from '@/lib/db/queries/evidence'
import { listPeople } from '@/lib/db/queries/people'
import { latestPrep } from '@/lib/db/queries/prep'
import { getProfile } from '@/lib/db/queries/profile'
import { sourceLabels } from '@/lib/evidence-label'
import { selectGaps } from '@/lib/gaps/select'
import { isGmailNote } from '@/lib/gmail-note'
import { hashEvidenceProjection } from '@/lib/hash'
import { type Locale, makeTranslate } from '@/lib/i18n'
import { isMachineAddress } from '@/lib/machine-address'
import { buildThread } from '@/lib/mail-thread'
import { marketLabel } from '@/lib/markets'
import { overviewStatus } from '@/lib/overview-status'
import { safeHttpUrl } from '@/lib/posting-source'
import { buildPrepContext } from '@/lib/prep/context'
import { loadPrepInput } from '@/lib/prep/load'
import type { PrepReport } from '@/lib/prep/verify'
import { resolveSources } from '@/lib/requirement-sources'
import { roleSummary } from '@/lib/role-summary'
import type { MailAgent } from '@/lib/satellite-types'
import {
  CoverLetterSchema,
  CVContentSchema,
  GroundingReportSchema,
  RecruiterMessageSchema,
  ScreeningSetSchema,
} from '@/lib/schemas'
import type { PrepContent } from '@/lib/schemas/prep'
import { seguimientoView } from '@/lib/seguimiento-view'
import { latestOutcome, nextOutcomes, stagePosition } from '@/lib/stage'
import { staleDays, staleThresholdDays } from '@/lib/stats'
import { evidenceHashOf } from '@/lib/variants'
import { verdictSentence } from '@/lib/verdict-sentence'

/** The job agent's mail (personal desktop builds only), passed in by the page. */
export type { MailAgent }

/** Companions persist as { document, report }; either half failing to parse reads as absent. */
function companionOf<S extends z.ZodTypeAny>(schema: S, raw: unknown) {
  const parsed = z.object({ document: schema, report: GroundingReportSchema }).safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * What Prepárate shows (spec 2026-10-18): the newest prep per language with
 * whether the evidence moved since, the people and link of the call it is
 * for, and the CV as sent.
 */
function prepData(
  db: Db,
  applicationId: string,
  interview: PrepView['interview'],
  labels: Record<string, string>,
): PrepView | null {
  const input = loadPrepInput(db, applicationId)
  if (!input) return null
  const ctx = buildPrepContext(input)
  const current = hashEvidenceProjection(buildEvidenceProjection(input.profile, input.evidence))
  const preps: PrepView['preps'] = {}
  for (const language of ['en', 'es-MX'] as const) {
    const row = latestPrep(db, applicationId, language)
    if (row)
      preps[language] = {
        content: row.content as PrepContent,
        report: row.report as PrepReport,
        stale: row.evidenceHash !== current,
      }
  }
  const eventId = interview?.outcomeId ?? ctx.round?.eventId ?? null
  const ofEvent = eventId ? listPeople(db, applicationId, eventId) : []
  const people = (ofEvent.length > 0 ? ofEvent : listPeople(db, applicationId)).filter(
    (p) => !isMachineAddress(p.email),
  )
  const event = input.application.outcomes.find((o) => o.id === eventId)
  return {
    applicationId,
    documentLanguage: input.application.documentLanguage,
    preps,
    interview,
    people: people.map((p) => ({ name: p.name, role: p.role, roleQuote: p.roleQuote })),
    meetingUrl: event?.meetingUrl ?? null,
    cv: ctx.cv,
    cvIsSnapshot: ctx.cvIsSnapshot,
    flaggedBulletIds: ctx.flaggedBulletIds,
    company: input.application.company,
    answers: input.answers.map((a) => ({
      id: a.id,
      part: a.part,
      question: a.question,
      answer: a.answer,
      createdAt: a.createdAt,
    })),
    requirements: ctx.requirements.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      mandatory: r.mandatory,
      strength: r.mapping?.strength ?? 'none',
    })),
    labels,
  }
}

/** The people and link of one call: its own people when it has any, else the application's. */
function meetingOf(db: Db, applicationId: string, eventId: string) {
  const ofEvent = listPeople(db, applicationId, eventId)
  const people = (ofEvent.length > 0 ? ofEvent : listPeople(db, applicationId)).filter(
    (p) => !isMachineAddress(p.email),
  )
  const event = listOutcomes(db, applicationId).find((o) => o.id === eventId)
  return { people, meetingUrl: event?.meetingUrl ?? null }
}

/**
 * Seguimiento's data (spec 2026-10-17 §1.3.4): the email thread, "Tú" and
 * the interview card from the outcome log, the agent's mail rows and the
 * used follow-ups. The thread shows whenever the agent is reachable or has
 * logged something here (so its Undo is never lost with the agent off);
 * otherwise, and always in the demo, the page falls back to the plain
 * timeline. Dates are read in the renderer's zone — the person's — and
 * formatted here, so the client never formats one itself.
 */
function trackData(
  db: Db,
  application: ApplicationRecord,
  mail: MailAgent | null,
  demo: boolean,
  locale: Locale,
) {
  const now = Date.now()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const outcomes = listOutcomes(db, application.id)
  const status = mail ? mail.status() : null
  const view = seguimientoView({
    view: buildThread({
      outcomes,
      mail: mail ? mail.thread(application.id) : [],
      // CVForge's own record of follow-ups sent: shown with the agent on or off.
      drafts: listUsedDrafts(db, application.id),
      account: status?.account ?? null,
      now,
      timeZone,
    }),
    company: application.company,
    locale,
    timeZone,
    now,
  })
  const thread = !demo && (mail !== null || outcomes.some((o) => isGmailNote(o.note)))
  // "No answer" is offered once the silence is real, by the same personal
  // threshold the Postulaciones card uses, judged for this application only.
  const nowIso = new Date(now).toISOString()
  const stale =
    application.status === 'applied' &&
    staleDays({ outcomes }, staleThresholdDays(listOpenOutcomeLogs(db), nowIso), nowIso) !== null
  return {
    interview: view.interview,
    mail: thread
      ? {
          cards: view.cards,
          count: view.count,
          you: view.you,
          connected: status !== null && status.state !== 'never',
        }
      : null,
    actions: nextOutcomes(application.status, { stale, latest: latestOutcome(outcomes) }),
    // Marked "no answer", yet a reply can still come: the question says so.
    late: application.status === 'closed' && latestOutcome(outcomes) === 'ghosted',
  }
}

export function loadApplication(
  db: Db,
  opts: {
    id: string
    search: { gapdelta?: string; step?: string }
    locale: Locale
    demo: boolean
    mail: MailAgent | null
  },
) {
  const { locale } = opts
  const t = makeTranslate(locale)
  const { gapdelta, step: stepParam } = opts.search
  const application = getApplication(db, opts.id)
  if (!application) return null
  const kit = kitPhaseFor(db, application.id)
  const mail = opts.demo ? null : opts.mail
  const mailAgent = mail !== null

  // Re-checked at the point of use: the route stores whatever z.string().url()
  // accepted, and that includes schemes no href should ever carry.
  const postingUrl = safeHttpUrl(application.sourceUrl)

  const mappingOf = new Map(application.mappings.map((m) => [m.requirementId, m]))

  // A verdict computed against yesterday's evidence base is stale, not wrong —
  // and a new role can turn a "skip" into a "worth it". Offer the re-map.
  const profile = getProfile(db)
  const evidence = profile ? listEvidence(db) : []
  const stale =
    profile !== null &&
    application.evidenceHash !== hashEvidenceProjection(buildEvidenceProjection(profile, evidence))

  const documents = application.documents as {
    cv?: unknown
    coverLetter?: unknown
    screening?: unknown
    recruiterMessage?: unknown
  } | null
  const savedCv = CVContentSchema.safeParse(documents?.cv)
  const savedReport = GroundingReportSchema.safeParse(application.groundingReport)

  const facts = {
    status: application.status,
    coverage: application.coverage,
    hasCv: savedCv.success,
    outcomes: application.outcomes,
  }
  const current = currentStep(facts)
  const states = stepStates(facts)
  // Every application opens on its overview; a link meant for a step names
  // it. A gap-fill run lands back on the gaps step, where its delta belongs.
  // A step this application does not show yet opens the overview instead.
  const shown = visibleSteps(facts)
  const step: Step = resolveStep(stepParam, gapdelta, shown)
  const gapSelection = selectGaps(application.requirements, application.mappings)
  // Mandatory first; within each group the uncovered ones lead, since those
  // are the reason to read the list at all.
  const ORDER = { none: 0, partial: 1, strong: 2 } as const
  const sortedRequirements = [...application.requirements].sort(
    (a, b) =>
      Number(b.mandatory) - Number(a.mandatory) ||
      ORDER[mappingOf.get(a.id)?.strength ?? 'none'] -
        ORDER[mappingOf.get(b.id)?.strength ?? 'none'],
  )

  const labels = sourceLabels(evidence, profile)
  const blockerIds = new Set(application.coverage.hardBlockers.map((r) => r.id))
  const chipItems: ChipRequirement[] = sortedRequirements.map((r) => {
    const m = mappingOf.get(r.id)
    return {
      id: r.id,
      keyword: r.keyword,
      kind: r.kind,
      mandatory: r.mandatory,
      strength: m?.strength ?? 'none',
      unjudged: m?.unjudged === true,
      blocker: blockerIds.has(r.id),
      rationale: m?.rationale ?? '',
      text: r.text,
      // A cited record deleted since stays visible as "no longer there"
      // rather than silently shrinking the evidence behind a claim; a cited
      // credential (language, degree, certification) resolves like a record.
      sources: resolveSources(m?.evidenceIds ?? [], profile, evidence),
    }
  })

  // One page, told as a story (friendly redesign 2026-11-21): the answer
  // alone until you choose to go for it — a link to any later part, a CV, or
  // a logged outcome — then the rest unfolds below it. `step` only says
  // where the page scrolls to.
  const sent = application.outcomes.length > 0
  const working =
    application.status !== 'archived' &&
    (sent ||
      savedCv.success ||
      application.status !== 'triaged' ||
      (step !== 'overview' && step !== 'decide'))
  const track = sent ? trackData(db, application, mail, opts.demo, locale) : null
  // How it stands, in one line under the title ("Rechazada · 19 nov"). An
  // ended application (closed or discarded) no longer offers paid moves.
  const ended = application.status === 'closed' || application.status === 'archived'
  const end = stagePosition(application.status, latestOutcome(application.outcomes)).end
  const statusLine = overviewStatus(t, {
    status: application.status,
    outcomes: application.outcomes,
    interview: buildThread({
      outcomes: listOutcomes(db, application.id),
      mail: [],
      drafts: [],
      account: null,
      now: Date.now(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).interview,
    hasCv: savedCv.success,
    createdAt: application.createdAt,
    locale,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    now: Date.now(),
  })

  return {
    application,
    gapdelta,
    kit,
    mailAgent,
    postingUrl,
    profile,
    evidence,
    stale,
    savedCv: savedCv.success ? savedCv.data : null,
    savedReport: savedReport.success ? savedReport.data : null,
    coverLetter: companionOf(CoverLetterSchema, documents?.coverLetter),
    screening: companionOf(ScreeningSetSchema, documents?.screening),
    recruiterMessage: companionOf(RecruiterMessageSchema, documents?.recruiterMessage),
    current,
    states,
    shown,
    step,
    next: nextStep(step, shown),
    gapSelection,
    hasGaps: gapSelection.primary.length > 0 || gapSelection.secondary.length > 0,
    archived: application.status === 'archived',
    labels,
    chipItems,
    sentence: verdictSentence(t, locale, {
      coverage: application.coverage,
      requirements: application.requirements,
      mappings: application.mappings,
    }),
    working,
    sent,
    ended,
    end,
    statusLine,
    summary: roleSummary(application.postingRaw, application.company),
    track,
    prepView:
      !ended && shown.includes('prep') && profile
        ? prepData(db, application.id, track?.interview ?? null, labels)
        : null,
    meeting: track?.interview ? meetingOf(db, application.id, track.interview.outcomeId) : null,
    draft: track ? latestDraft(db, application.id) : null,
    variants: working
      ? listVariants(db)
          .filter((v) => v.cv && v.language === application.documentLanguage)
          // This posting's market first: page length and spelling follow it.
          .sort(
            (a, b) =>
              Number(b.market === application.market) - Number(a.market === application.market),
          )
          .map((v) => {
            const changed = profile !== null && v.evidenceHash !== evidenceHashOf(profile, evidence)
            return {
              id: v.id,
              stale: changed,
              label: [
                v.name,
                marketLabel(v.market, locale),
                ...(changed ? [t('variants.pickerStale')] : []),
              ].join(' · '),
            }
          })
      : [],
  }
}

export type ApplicationData = NonNullable<ReturnType<typeof loadApplication>>
