'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordChase } from '@/lib/agent/finds'
import { db } from '@/lib/db/client'
import {
  getApplication,
  listMailOutcomes,
  logManualOutcome,
  removeOutcome,
  setScheduledAt,
} from '@/lib/db/queries/applications'
import { getDraft, markDraftUsed } from '@/lib/db/queries/drafts'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { satelliteDbPath } from '@/lib/settings'

const OutcomeType = z.enum([
  'applied',
  'acknowledged',
  'screen',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'ghosted',
])

type Result = { ok: true } | { ok: false; error: string; code: string }
type LogResult =
  | { ok: true; outcomeId: string; repeated: boolean }
  | { ok: false; error: string; code: string }

/**
 * One click, one outcome event — and a second click of the same button is
 * still that one event (see logManualOutcome). The whole outcomes layer is worthless if
 * logging decays, so this is the cheapest write in the product: no form, no
 * dialog, the timestamp is now.
 */
export async function logOutcomeAction(applicationId: string, type: string): Promise<LogResult> {
  if (isDemo()) return demoBlock()
  const parsed = OutcomeType.safeParse(type)
  if (!parsed.success) {
    return { ok: false, error: 'Unknown outcome.', code: 'invalid-request' }
  }
  if (!getApplication(db, applicationId)) {
    return { ok: false, error: 'Not found.', code: 'role-not-found' }
  }

  // A repeat tap returns the event already logged; its undo removes that one.
  const { id: outcomeId, repeated } = logManualOutcome(db, applicationId, parsed.data)
  revalidatePath('/pipeline')
  revalidatePath('/')
  revalidatePath(`/application/${applicationId}`)
  return { ok: true, outcomeId, repeated }
}

/** The undo for a one-click log: removes exactly the event that click wrote. */
export async function undoOutcomeAction(applicationId: string, outcomeId: string): Promise<Result> {
  if (isDemo()) return demoBlock()
  removeOutcome(db, applicationId, outcomeId)
  revalidatePath('/pipeline')
  revalidatePath('/')
  revalidatePath(`/application/${applicationId}`)
  return { ok: true }
}

/**
 * Deshacer on "Detectado en tu correo": removes an outcome the agent wrote
 * from an email. Only a `gmail:` event qualifies — a click the user made is
 * never reachable from here, whatever id is sent. The message stays in the
 * agent's `mail_seen`, so it is not applied again.
 */
export async function undoMailOutcomeAction(
  applicationId: string,
  outcomeId: string,
): Promise<Result> {
  if (isDemo()) return demoBlock()
  if (!listMailOutcomes(db, String(applicationId)).some((o) => o.id === outcomeId)) {
    return { ok: false, error: 'Not found.', code: 'not-found' }
  }
  removeOutcome(db, applicationId, outcomeId)
  revalidatePath('/pipeline')
  revalidatePath('/')
  revalidatePath(`/application/${applicationId}`)
  return { ok: true }
}

/**
 * Only unambiguous values are stored: a bare date `YYYY-MM-DD`, or a datetime
 * with an explicit zone (`Z` or an offset), which is normalised to UTC `...Z`.
 * A datetime with no zone is rejected. Year 2020-2100, real calendar date.
 */
function normaliseInterviewTime(v: string): string | null {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(v)
  if (!m) return null
  const year = Number(m[1])
  if (year < 2020 || year > 2100) return null
  const day = new Date(`${v.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== v.slice(0, 10)) return null
  if (v.length === 10) return v
  if (!m[4]) return null
  const t = new Date(v)
  if (Number.isNaN(t.getTime())) return null
  const out = t.toISOString()
  const y = Number(out.slice(0, 4))
  return y >= 2020 && y <= 2100 ? out : null
}

/**
 * Sets (or, with null, clears) when an interview takes place. Applies only to
 * `interview` and `screen` outcomes (gmail or manual) of that application; any
 * other outcome, or another application's, is `not-found`.
 *
 * Accepted values: `YYYY-MM-DD`, or a datetime WITH a zone (`Z` or `+hh:mm`),
 * stored as UTC via toISOString. A zoneless datetime is rejected as ambiguous:
 * the UI must convert the browser's `datetime-local` value to UTC first.
 */
export async function setInterviewTimeAction(
  applicationId: string,
  outcomeId: string,
  iso: string | null,
): Promise<Result> {
  if (isDemo()) return demoBlock()
  let value: string | null = null
  if (iso !== null) {
    value = typeof iso === 'string' ? normaliseInterviewTime(iso) : null
    if (value === null) return { ok: false, error: 'Invalid date.', code: 'invalid-request' }
  }
  if (!setScheduledAt(db, String(applicationId), String(outcomeId), value)) {
    return { ok: false, error: 'Not found.', code: 'not-found' }
  }
  revalidatePath('/pipeline')
  revalidatePath('/')
  revalidatePath(`/application/${applicationId}`)
  return { ok: true }
}

type DraftUsedResult = { ok: true; usedAt: string } | { ok: false; error: string; code: string }

/**
 * "Ya lo envié" on a follow-up draft (spec 2026-10-16 agent stage B §5). The
 * user sent it himself; this records when, and adds a `chase` to the agent's
 * run_log for the weekly count. No agent, or an agent file that cannot be
 * written, still marks the draft — the count is the agent's, the draft is ours.
 */
export async function markDraftUsedAction(
  applicationId: string,
  draftId: string,
): Promise<DraftUsedResult> {
  if (isDemo()) return demoBlock()
  // Server actions take whatever the client sends: both ids must be real strings.
  if (
    typeof applicationId !== 'string' ||
    typeof draftId !== 'string' ||
    applicationId === '' ||
    draftId === ''
  ) {
    return { ok: false, error: 'Invalid request.', code: 'invalid-request' }
  }
  const draft = getDraft(db, draftId)
  if (!draft || draft.applicationId !== applicationId) {
    return { ok: false, error: 'Not found.', code: 'not-found' }
  }
  const first = markDraftUsed(db, draftId)
  const usedAt = getDraft(db, draftId)?.usedAt ?? new Date().toISOString()
  // Once per draft: a second tap is not a second follow-up.
  const file = satelliteDbPath()
  if (first && file) recordChase(file, `follow-up:${draftId}`)
  revalidatePath(`/application/${applicationId}`)
  return { ok: true, usedAt }
}
