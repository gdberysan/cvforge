import { asc, eq } from 'drizzle-orm'
import {
  type CVContent,
  CVContentSchema,
  type DocumentLanguage,
  type GroundingReport,
  GroundingReportSchema,
  type Market,
} from '@/lib/schemas'
import type { Db } from '../client'
import { cvVariants } from '../schema'

export type CVVariant = {
  id: string
  name: string
  focus: string
  language: DocumentLanguage
  market: Market
  /** Null until the first compose finishes (or if a stored row stops parsing). */
  cv: CVContent | null
  report: GroundingReport | null
  evidenceHash: string | null
  composedAt: string | null
}

type Row = typeof cvVariants.$inferSelect

function toVariant(row: Row): CVVariant {
  const cv = CVContentSchema.safeParse(row.cv)
  const report = GroundingReportSchema.safeParse(row.report)
  return {
    id: row.id,
    name: row.name,
    focus: row.focus,
    language: row.language,
    market: row.market,
    cv: cv.success ? cv.data : null,
    report: report.success ? report.data : null,
    evidenceHash: row.evidenceHash,
    composedAt: row.composedAt,
  }
}

export function listVariants(db: Db): CVVariant[] {
  return db.select().from(cvVariants).orderBy(asc(cvVariants.createdAt)).all().map(toVariant)
}

export function getVariant(db: Db, id: string): CVVariant | null {
  const row = db.select().from(cvVariants).where(eq(cvVariants.id, id)).get()
  return row ? toVariant(row) : null
}

export type VariantBrief = Pick<CVVariant, 'name' | 'focus' | 'language' | 'market'>

/** Saves the brief before composing, so a failed compose still leaves an editable row. */
export function upsertVariantBrief(db: Db, brief: VariantBrief & { id?: string }): string {
  const id = brief.id ?? `cvv_${crypto.randomUUID()}`
  const values = {
    name: brief.name,
    focus: brief.focus,
    language: brief.language,
    market: brief.market,
  }
  db.insert(cvVariants)
    .values({ id, ...values })
    .onConflictDoUpdate({ target: cvVariants.id, set: values })
    .run()
  return id
}

export function saveVariantCv(
  db: Db,
  id: string,
  result: { cv: CVContent; report: GroundingReport; evidenceHash: string },
  /** The edited brief this CV was composed from, written in the same update. */
  brief?: VariantBrief,
): void {
  db.update(cvVariants)
    .set({
      ...(brief && {
        name: brief.name,
        focus: brief.focus,
        language: brief.language,
        market: brief.market,
      }),
      cv: result.cv,
      report: result.report,
      evidenceHash: result.evidenceHash,
      composedAt: new Date().toISOString(),
    })
    .where(eq(cvVariants.id, id))
    .run()
}

/**
 * Replaces a composed CV and its report in place — when its translation was
 * cut to fit and the same cuts were made here. The evidence hash and the
 * compose time stay: nothing was composed, only removed.
 */
export function replaceVariantCv(
  db: Db,
  id: string,
  result: { cv: CVContent; report: GroundingReport },
): void {
  db.update(cvVariants)
    .set({ cv: result.cv, report: result.report })
    .where(eq(cvVariants.id, id))
    .run()
}

/**
 * Saves a translation: over `targetId` — the other side of the pair, which
 * the caller has checked — or, with none, as a new row. Never found by name:
 * two rows can share a name and market, and a lookup could replace the
 * composed CV of a different pair.
 */
export function saveTranslatedVariant(
  db: Db,
  brief: VariantBrief,
  result: { cv: CVContent; report: GroundingReport; evidenceHash: string },
  targetId?: string,
): string {
  const values = {
    ...brief,
    cv: result.cv,
    report: result.report,
    evidenceHash: result.evidenceHash,
    composedAt: new Date().toISOString(),
  }
  if (targetId !== undefined) {
    db.update(cvVariants).set(values).where(eq(cvVariants.id, targetId)).run()
    return targetId
  }
  const id = `cvv_${crypto.randomUUID()}`
  db.insert(cvVariants)
    .values({ id, ...values })
    .run()
  return id
}

export function deleteVariant(db: Db, id: string): void {
  db.delete(cvVariants).where(eq(cvVariants.id, id)).run()
}
