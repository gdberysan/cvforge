import { z } from 'zod'
import { InterviewQuestionSchema } from '@/lib/schemas'

/**
 * Interview answers are the most expensive text the user types in the whole
 * product — the detail their CV lost exists nowhere else. Drafts persist per
 * role so a refresh, a stray nav click, or a crash mid-interview costs
 * nothing. Cleared only when the interview is accepted.
 *
 * Keyed by roleId AND a fingerprint of the role (locale, company, title).
 * roleIds are not permanently stable — a LinkedIn re-import can reassign
 * which role a short id like "exp_1" refers to (see lib/import/reconcile.ts,
 * which protects DB-side evidence attribution but has no reach into a
 * browser-local draft written under the id's old meaning). Storing the
 * fingerprint alongside the draft, and refusing to resume when it no longer
 * matches, is what stops a stale draft from one role bleeding into another
 * that now happens to share its id — wrong company or wrong language both
 * come from the same failure mode.
 */

const FingerprintSchema = z.object({
  locale: z.enum(['en', 'es']),
  company: z.string(),
  title: z.string(),
})
export type DraftFingerprint = z.infer<typeof FingerprintSchema>

const DraftSchema = z.object({
  questions: z.array(InterviewQuestionSchema),
  answers: z.record(z.string(), z.string()),
})
export type InterviewDraft = z.infer<typeof DraftSchema>

const StoredSchema = z.object({
  fingerprint: FingerprintSchema,
  draft: DraftSchema,
})

const keyFor = (roleId: string) => `cvforge.interview.${roleId}`

const sameFingerprint = (a: DraftFingerprint, b: DraftFingerprint) =>
  a.locale === b.locale && a.company === b.company && a.title === b.title

export function loadDraft(
  storage: Storage,
  roleId: string,
  fingerprint: DraftFingerprint,
): InterviewDraft | null {
  try {
    const raw = storage.getItem(keyFor(roleId))
    if (!raw) return null
    const parsed = StoredSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    if (!sameFingerprint(parsed.data.fingerprint, fingerprint)) return null
    return parsed.data.draft
  } catch {
    // Corrupt JSON or a storage that refuses to read: a lost draft is
    // recoverable, a crashed interview page is not.
    return null
  }
}

export function saveDraft(
  storage: Storage,
  roleId: string,
  fingerprint: DraftFingerprint,
  draft: InterviewDraft,
): void {
  try {
    storage.setItem(keyFor(roleId), JSON.stringify({ fingerprint, draft }))
  } catch {
    // Quota exceeded or private-mode storage: typing must keep working even
    // if this draft cannot be kept.
  }
}

export function clearDraft(storage: Storage, roleId: string): void {
  try {
    storage.removeItem(keyFor(roleId))
  } catch {
    // Nothing to do — worst case the draft is offered again next visit.
  }
}
