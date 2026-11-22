import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { readAliases } from '@/lib/company-aliases'
import type { ApplicationLink } from '@/lib/discover/annotate'
import { GMAIL_NOTE_PREFIX, parseGmailNote } from '@/lib/gmail-note'
import {
  type ApplicationStatus,
  ApplicationStatusSchema,
  type Coverage,
  CoverageSchema,
  type DocumentLanguage,
  type EvidenceMapping,
  type GroundingReport,
  type Market,
  type OutcomeEvent,
  type OutcomeType,
  type Requirement,
  type Source,
  SourceSchema,
} from '@/lib/schemas'
import { deriveStatus } from '@/lib/status'
import type { Db } from '../client'
import {
  applications,
  mappings as mappingsTable,
  outcomeEvents,
  requirements as requirementsTable,
} from '../schema'

export type ApplicationRecord = {
  id: string
  createdAt: string
  source: Source
  sourceUrl: string | null
  company: string
  /** Other names or email domains the employer writes under (migration 0012). */
  companyAliases: string[]
  jobTitle: string
  market: Market
  documentLanguage: DocumentLanguage
  postingRaw: string
  postingHash: string
  /** Hash of the evidence projection the mappings were computed against; null reads as stale. */
  evidenceHash: string | null
  status: ApplicationStatus
  archived: boolean
  notes: string
  coverage: Coverage
  requirements: Requirement[]
  mappings: EvidenceMapping[]
  outcomes: OutcomeEvent[]
  documents: unknown
  groundingReport: unknown
}

/**
 * `status` is a denormalised text column, so it is validated on the way out
 * rather than trusted. An unrecognised value falls back to the state every
 * application starts in instead of leaking a raw string into the interface.
 */
const toStatus = (value: string): ApplicationStatus =>
  ApplicationStatusSchema.catch('triaged').parse(value)

/** Requirement ids are namespaced per application so they never collide. */
const composite = (applicationId: string, id: string) => `${applicationId}:${id}`

export function createApplication(
  db: Db,
  input: {
    /** A caller may fix the id (the demo seed keys PDFs and links by it). */
    id?: string
    source: Source
    sourceUrl?: string
    company: string
    jobTitle: string
    market: Market
    documentLanguage: DocumentLanguage
    postingRaw: string
    postingHash: string
    evidenceHash: string
    requirements: Requirement[]
    mappings: EvidenceMapping[]
    coverage: Coverage
  },
): string {
  const id = input.id ?? `app_${crypto.randomUUID()}`

  db.transaction((tx) => {
    tx.insert(applications)
      .values({
        id,
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        company: input.company,
        jobTitle: input.jobTitle,
        market: input.market,
        documentLanguage: input.documentLanguage,
        postingRaw: input.postingRaw,
        postingHash: input.postingHash,
        evidenceHash: input.evidenceHash,
        status: 'triaged',
        coverage: CoverageSchema.parse(input.coverage),
      })
      .run()

    for (const req of input.requirements) {
      tx.insert(requirementsTable)
        .values({
          id: composite(id, req.id),
          applicationId: id,
          text: req.text,
          keyword: req.keyword,
          variants: req.variants,
          kind: req.kind,
          mandatory: req.mandatory,
          weight: req.weight,
        })
        .run()
    }

    for (const mapping of input.mappings) {
      tx.insert(mappingsTable)
        .values({
          id: composite(id, `${mapping.requirementId}:m`),
          applicationId: id,
          requirementId: composite(id, mapping.requirementId),
          evidenceIds: mapping.evidenceIds,
          strength: mapping.strength,
          rationale: mapping.rationale,
        })
        .run()
    }
  })

  return id
}

export function getApplication(db: Db, id: string): ApplicationRecord | null {
  const row = db.select().from(applications).where(eq(applications.id, id)).get()
  if (!row) return null

  const reqRows = db
    .select()
    .from(requirementsTable)
    .where(eq(requirementsTable.applicationId, id))
    .all()
  const mapRows = db.select().from(mappingsTable).where(eq(mappingsTable.applicationId, id)).all()
  const outRows = db.select().from(outcomeEvents).where(eq(outcomeEvents.applicationId, id)).all()

  const strip = (value: string) => value.slice(id.length + 1)

  return {
    id: row.id,
    createdAt: row.createdAt,
    source: row.source,
    sourceUrl: row.sourceUrl,
    company: row.company,
    companyAliases: readAliases(row.companyAliases),
    jobTitle: row.jobTitle,
    market: row.market,
    documentLanguage: row.documentLanguage,
    postingRaw: row.postingRaw,
    postingHash: row.postingHash,
    evidenceHash: row.evidenceHash,
    status: toStatus(row.status),
    archived: row.archived,
    notes: row.notes,
    coverage: CoverageSchema.parse(row.coverage),
    requirements: reqRows.map((r) => ({
      id: strip(r.id),
      text: r.text,
      keyword: r.keyword,
      variants: r.variants,
      kind: r.kind,
      mandatory: r.mandatory,
      weight: r.weight as 1 | 2 | 3,
    })),
    mappings: mapRows.map((m) => ({
      requirementId: strip(m.requirementId),
      evidenceIds: m.evidenceIds,
      strength: m.strength,
      rationale: m.rationale,
    })),
    outcomes: outRows.map((o) => ({
      at: o.at,
      type: o.type,
      ...(o.note ? { note: o.note } : {}),
      ...(o.scheduledAt ? { scheduledAt: o.scheduledAt } : {}),
    })),
    documents: row.documents,
    groundingReport: row.groundingReport,
  }
}

export function findByPostingHash(db: Db, hash: string): ApplicationRecord | null {
  const row = db.select().from(applications).where(eq(applications.postingHash, hash)).get()
  return row ? getApplication(db, row.id) : null
}

/** Appends to the log, then recomputes the denormalised status column. */
export function appendOutcome(db: Db, applicationId: string, event: OutcomeEvent): string {
  const id = `out_${crypto.randomUUID()}`
  db.transaction((tx) => {
    tx.insert(outcomeEvents)
      .values({
        id,
        applicationId,
        at: event.at,
        type: event.type,
        note: event.note ?? null,
        scheduledAt: event.scheduledAt ?? null,
      })
      .run()

    const row = tx.select().from(applications).where(eq(applications.id, applicationId)).get()
    const outs = tx
      .select()
      .from(outcomeEvents)
      .where(eq(outcomeEvents.applicationId, applicationId))
      .all()

    const status = deriveStatus({
      outcomes: outs.map((o) => ({ at: o.at, type: o.type })),
      hasDocuments: row?.documents != null,
      archived: row?.archived ?? false,
    })

    // What the company received, kept once at send time: a CV recomposed
    // later must not change what "Defend your CV" prepares him for.
    const docs = row?.documents as Record<string, unknown> | null | undefined
    const snapshot =
      event.type === 'applied' && docs?.cv != null && docs.sentCv == null
        ? { documents: { ...docs, sentCv: docs.cv } }
        : {}

    tx.update(applications)
      .set({ status, ...snapshot })
      .where(eq(applications.id, applicationId))
      .run()
  })
  return id
}

/** How long a second tap of the same outcome button counts as the first. */
export const REPEAT_TAP_MS = 10 * 60_000

/**
 * A one-click log from the app. The same outcome tapped again on the same
 * application within REPEAT_TAP_MS is the same event and returns the id
 * already logged, marked `repeated` so the app offers no undo for it (that
 * undo would delete the one real event): before this, double taps and quick taps through the
 * buttons turned one HR call into "screen + interview + interview" and the
 * history claimed nine interviews where there were two. A different outcome
 * tapped right after (screen, then interview) is still its own event — both
 * can be true. Only the person's
 * own taps (no note) count; an outcome the agent logged from an email
 * carries a note and is never matched.
 */
export function logManualOutcome(
  db: Db,
  applicationId: string,
  type: OutcomeEvent['type'],
  now: Date = new Date(),
): { id: string; repeated: boolean } {
  const since = new Date(now.getTime() - REPEAT_TAP_MS).toISOString()
  const recent = db
    .select({ id: outcomeEvents.id })
    .from(outcomeEvents)
    .where(
      and(
        eq(outcomeEvents.applicationId, applicationId),
        eq(outcomeEvents.type, type),
        sql`${outcomeEvents.note} IS NULL`,
        sql`${outcomeEvents.at} >= ${since}`,
      ),
    )
    .orderBy(desc(outcomeEvents.at))
    .get()
  if (recent) return { id: recent.id, repeated: true }
  return { id: appendOutcome(db, applicationId, { at: now.toISOString(), type }), repeated: false }
}

/**
 * Takes back one logged outcome — the undo of a one-click log — and re-derives
 * the status from what remains, exactly as appending does. Scoped to the
 * application so a stray id can never touch another one's history.
 */
export function removeOutcome(db: Db, applicationId: string, outcomeId: string): void {
  db.transaction((tx) => {
    tx.delete(outcomeEvents)
      .where(and(eq(outcomeEvents.id, outcomeId), eq(outcomeEvents.applicationId, applicationId)))
      .run()
    const row = tx.select().from(applications).where(eq(applications.id, applicationId)).get()
    const outs = tx
      .select()
      .from(outcomeEvents)
      .where(eq(outcomeEvents.applicationId, applicationId))
      .all()
    const status = deriveStatus({
      outcomes: outs.map((o) => ({ at: o.at, type: o.type })),
      hasDocuments: row?.documents != null,
      archived: row?.archived ?? false,
    })
    // The snapshot of the CV sent belongs to an "applied": with none left it
    // was a slip, and the real send must take its own (prep defends it).
    const docs = row?.documents as Record<string, unknown> | null | undefined
    const unsent =
      docs?.sentCv != null && !outs.some((o) => o.type === 'applied')
        ? { documents: Object.fromEntries(Object.entries(docs).filter(([k]) => k !== 'sentCv')) }
        : {}
    tx.update(applications)
      .set({ status, ...unsent })
      .where(eq(applications.id, applicationId))
      .run()
  })
}

/**
 * Sets or clears when an interview or screen outcome takes place (other types: false). Scoped by
 * both ids so a stray id never touches another application's history; returns
 * false when there is no such row. Status is untouched: the time is not an event.
 */
export function setScheduledAt(
  db: Db,
  applicationId: string,
  outcomeId: string,
  iso: string | null,
): boolean {
  const res = db
    .update(outcomeEvents)
    .set({ scheduledAt: iso })
    .where(
      and(
        eq(outcomeEvents.id, outcomeId),
        eq(outcomeEvents.applicationId, applicationId),
        inArray(outcomeEvents.type, ['interview', 'screen']),
      ),
    )
    .run()
  return res.changes > 0
}

/**
 * The outcomes the agent read from the user's mail (note `gmail:<id> «quote»`),
 * oldest first, with the id Undo needs. Anything else in the log is never listed
 * here, so Undo can never reach a click the user made.
 */
export function listMailOutcomes(
  db: Db,
  applicationId: string,
): { id: string; at: string; type: OutcomeType; quote: string; scheduledAt: string | null }[] {
  return db
    .select()
    .from(outcomeEvents)
    .where(
      and(
        eq(outcomeEvents.applicationId, applicationId),
        sql`substr(${outcomeEvents.note}, 1, ${GMAIL_NOTE_PREFIX.length}) = ${GMAIL_NOTE_PREFIX}`,
      ),
    )
    .orderBy(asc(outcomeEvents.at))
    .all()
    .map((o) => ({
      id: o.id,
      at: o.at,
      type: o.type,
      scheduledAt: o.scheduledAt,
      quote: parseGmailNote(o.note)?.quote ?? '',
    }))
}

/**
 * The whole outcome log with ids, oldest first (insertion order breaks a
 * same-instant tie): Seguimiento's thread builder sorts it into mail events,
 * "Tú" and the interview card, and needs each id for Undo and the time edit.
 */
export function listOutcomes(
  db: Db,
  applicationId: string,
): {
  id: string
  at: string
  type: OutcomeType
  note: string | null
  scheduledAt: string | null
  meetingUrl: string | null
}[] {
  return db
    .select({
      id: outcomeEvents.id,
      at: outcomeEvents.at,
      type: outcomeEvents.type,
      note: outcomeEvents.note,
      scheduledAt: outcomeEvents.scheduledAt,
      meetingUrl: outcomeEvents.meetingUrl,
    })
    .from(outcomeEvents)
    .where(eq(outcomeEvents.applicationId, applicationId))
    .orderBy(asc(outcomeEvents.at), asc(sql`rowid`))
    .all()
}

/**
 * Each open (non-archived) application's outcome log, dates and types only:
 * all the personal stale threshold needs, without loading every posting.
 */
export function listOpenOutcomeLogs(db: Db): { outcomes: { at: string; type: OutcomeType }[] }[] {
  const rows = db
    .select({
      applicationId: outcomeEvents.applicationId,
      at: outcomeEvents.at,
      type: outcomeEvents.type,
    })
    .from(outcomeEvents)
    .innerJoin(applications, eq(applications.id, outcomeEvents.applicationId))
    .where(eq(applications.archived, false))
    .all()
  const byApp = new Map<string, { at: string; type: OutcomeType }[]>()
  for (const r of rows) {
    const list = byApp.get(r.applicationId) ?? []
    list.push({ at: r.at, type: r.type })
    byApp.set(r.applicationId, list)
  }
  return [...byApp.values()].map((outcomes) => ({ outcomes }))
}

/** Replaces the aliases wholesale; the caller has normalised them (normalizeAliases). */
export function setCompanyAliases(db: Db, applicationId: string, aliases: string[]): void {
  db.update(applications)
    .set({ companyAliases: aliases })
    .where(eq(applications.id, applicationId))
    .run()
}

/**
 * Skip at triage = archive. The row and its coverage stay (gap recurrence is
 * computed over skipped postings too); only the pipeline stops showing it.
 * Unarchiving re-derives the real status from the outcome log.
 */
export function setArchived(db: Db, applicationId: string, archived: boolean): void {
  db.transaction((tx) => {
    const row = tx.select().from(applications).where(eq(applications.id, applicationId)).get()
    if (!row) return
    const outs = tx
      .select()
      .from(outcomeEvents)
      .where(eq(outcomeEvents.applicationId, applicationId))
      .all()

    const status = deriveStatus({
      outcomes: outs.map((o) => ({ at: o.at, type: o.type })),
      hasDocuments: row.documents != null,
      archived,
    })

    tx.update(applications)
      .set({ archived, status })
      .where(eq(applications.id, applicationId))
      .run()
  })
}

/**
 * Re-mapping after the evidence base changed: requirements came from the
 * posting and stand; mappings, coverage, and the evidence hash they were
 * computed against are replaced together.
 */
export function updateAnalysis(
  db: Db,
  applicationId: string,
  input: { mappings: EvidenceMapping[]; coverage: Coverage; evidenceHash: string },
): void {
  db.transaction((tx) => {
    tx.delete(mappingsTable).where(eq(mappingsTable.applicationId, applicationId)).run()

    for (const mapping of input.mappings) {
      tx.insert(mappingsTable)
        .values({
          id: composite(applicationId, `${mapping.requirementId}:m`),
          applicationId,
          requirementId: composite(applicationId, mapping.requirementId),
          evidenceIds: mapping.evidenceIds,
          strength: mapping.strength,
          rationale: mapping.rationale,
        })
        .run()
    }

    tx.update(applications)
      .set({
        coverage: CoverageSchema.parse(input.coverage),
        evidenceHash: input.evidenceHash,
      })
      .where(eq(applications.id, applicationId))
      .run()
  })
}

/**
 * Companion documents land one at a time; each merge keeps what the others
 * saved. Status re-derives because the first document moves an application
 * from triaged to drafting.
 */
export function mergeDocuments(
  db: Db,
  applicationId: string,
  patch: Record<string, unknown>,
): void {
  db.transaction((tx) => {
    const row = tx.select().from(applications).where(eq(applications.id, applicationId)).get()
    if (!row) return
    const current = (row.documents as Record<string, unknown> | null) ?? {}
    const documents = { ...current, ...patch }

    const outs = tx
      .select()
      .from(outcomeEvents)
      .where(eq(outcomeEvents.applicationId, applicationId))
      .all()

    tx.update(applications)
      .set({
        documents,
        status: deriveStatus({
          outcomes: outs.map((o) => ({ at: o.at, type: o.type })),
          hasDocuments: true,
          archived: row.archived,
        }),
      })
      .where(eq(applications.id, applicationId))
      .run()
  })
}

/**
 * A re-triage of a cached posting can arrive with a different market, source
 * or URL than the first paste recorded. The intake fields follow the latest
 * request — otherwise the CV is composed under the wrong market's rules and
 * the user is never told their choice was ignored.
 */
export function updateIntake(
  db: Db,
  applicationId: string,
  intake: { market: Market; source?: Source; sourceUrl?: string },
): void {
  db.update(applications)
    .set({
      market: intake.market,
      ...(intake.source ? { source: intake.source } : {}),
      ...(intake.sourceUrl ? { sourceUrl: intake.sourceUrl } : {}),
    })
    .where(eq(applications.id, applicationId))
    .run()
}

export function saveDocuments(
  db: Db,
  applicationId: string,
  documents: Record<string, unknown>,
  report: GroundingReport,
): void {
  db.transaction((tx) => {
    const outs = tx
      .select()
      .from(outcomeEvents)
      .where(eq(outcomeEvents.applicationId, applicationId))
      .all()
    const row = tx.select().from(applications).where(eq(applications.id, applicationId)).get()

    // Merge, never replace: recomposing the CV must not delete the cover
    // letter and screening answers already generated (and possibly refined)
    // for this application.
    const current = (row?.documents as Record<string, unknown> | null) ?? {}

    tx.update(applications)
      .set({
        documents: { ...current, ...documents },
        groundingReport: report,
        status: deriveStatus({
          outcomes: outs.map((o) => ({ at: o.at, type: o.type })),
          hasDocuments: true,
          archived: row?.archived ?? false,
        }),
      })
      .where(eq(applications.id, applicationId))
      .run()
  })
}

export type ApplicationSummary = {
  id: string
  createdAt: string
  company: string
  jobTitle: string
  source: Source
  status: ApplicationStatus
  verdict: Coverage['verdict']
  mandatoryStrong: number
  mandatoryTotal: number
  hasDocuments: boolean
}

/** FK cascades take requirements, mappings and outcomes with the row. */
export function deleteApplication(db: Db, applicationId: string): void {
  db.delete(applications).where(eq(applications.id, applicationId)).run()
}

/** Every application in full, for the stats layer. Tens of rows, single user — a loop is fine. */
export function listFullApplications(db: Db, opts?: { archived?: boolean }): ApplicationRecord[] {
  return listApplications(db, opts)
    .map((a) => getApplication(db, a.id))
    .filter((a): a is ApplicationRecord => a !== null)
}

/**
 * Newest first. Read-only list for the pipeline view. Skipped (archived)
 * postings stay out unless explicitly requested, so a triage session's
 * rejects never bury the applications being pursued.
 */
export function listApplications(db: Db, opts?: { archived?: boolean }): ApplicationSummary[] {
  return db
    .select()
    .from(applications)
    .where(eq(applications.archived, opts?.archived ?? false))
    .orderBy(desc(applications.createdAt))
    .all()
    .map((row) => {
      const coverage = CoverageSchema.parse(row.coverage)
      return {
        id: row.id,
        createdAt: row.createdAt,
        company: row.company,
        jobTitle: row.jobTitle,
        source: SourceSchema.catch('other').parse(row.source),
        status: toStatus(row.status),
        verdict: coverage.verdict,
        mandatoryStrong: coverage.mandatoryStrong,
        mandatoryTotal: coverage.mandatoryTotal,
        hasDocuments: row.documents != null,
      }
    })
}

/**
 * The cheap projection the discover page annotates cards from: every
 * application's identity, link, status and age — no requirements, mappings
 * or posting bodies.
 */
export function listApplicationLinks(db: Db): ApplicationLink[] {
  return db
    .select({
      id: applications.id,
      sourceUrl: applications.sourceUrl,
      status: applications.status,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .all()
    .map((row) => ({ ...row, status: toStatus(row.status) }))
}
