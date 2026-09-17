import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
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
  const id = input.id ?? `app_${randomUUID()}`

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
    outcomes: outRows.map((o) => ({ at: o.at, type: o.type, ...(o.note ? { note: o.note } : {}) })),
    documents: row.documents,
    groundingReport: row.groundingReport,
  }
}

export function findByPostingHash(db: Db, hash: string): ApplicationRecord | null {
  const row = db.select().from(applications).where(eq(applications.postingHash, hash)).get()
  return row ? getApplication(db, row.id) : null
}

/** Appends to the log, then recomputes the denormalised status column. */
export function appendOutcome(db: Db, applicationId: string, event: OutcomeEvent): void {
  db.transaction((tx) => {
    tx.insert(outcomeEvents)
      .values({
        id: `out_${randomUUID()}`,
        applicationId,
        at: event.at,
        type: event.type,
        note: event.note ?? null,
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

    tx.update(applications).set({ status }).where(eq(applications.id, applicationId)).run()
  })
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
