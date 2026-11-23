'use server'

import { revalidatePath } from 'next/cache'
import { chaseFind } from '@/lib/agent/chase'
import { deletePendingFind, getPendingFind, recordChase } from '@/lib/agent/finds'
import { db } from '@/lib/db/client'
import { appendOutcome, getApplication } from '@/lib/db/queries/applications'
import { dismissJob } from '@/lib/db/queries/discover'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { enqueueChaseKit } from '@/lib/kit/queue'
import {
  closeMailSuggestion,
  getMailSuggestion,
  markMailOutcome,
  reopenMailSuggestion,
} from '@/lib/satellite/mail'
import { satelliteDbPath } from '@/lib/settings'

export type ChaseFindResult =
  | { ok: true; applicationId: string; kit: 'queued' | 'off' | 'cap' | 'open' | 'has-docs' }
  | { ok: false; code: 'gone' | 'repost' | 'agent-off' | 'unexpected' }
  | ReturnType<typeof demoBlock>

/**
 * Perseguir on a find from the job agent: the same chase Telegram's button
 * runs (lib/agent/chase.ts), then the kit, written in the background by the
 * server. Allowed from the phone — it is the point of the push.
 */
export async function chaseFindAction(postingId: string): Promise<ChaseFindResult> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!file) return { ok: false, code: 'agent-off' }
  const pending = getPendingFind(file, postingId)
  // Chased or dismissed in Telegram meanwhile, or swept after 30 days.
  if (!pending) return { ok: false, code: 'gone' }

  let out: ReturnType<typeof chaseFind>
  try {
    out = chaseFind(db, postingId, pending.analysis)
  } catch {
    // The find stays, so the tap can be tried again.
    return { ok: false, code: 'unexpected' }
  }
  // Whatever the outcome, this find has had its answer.
  deletePendingFind(file, postingId)
  revalidatePath('/')
  if (out.kind === 'repost') return { ok: false, code: 'repost' }
  recordChase(file, postingId)

  return { ok: true, applicationId: out.applicationId, kit: enqueueChaseKit(db, out.applicationId) }
}

/** Descartar: never shown again, here or in Telegram. */
export async function dismissFindAction(
  postingId: string,
): Promise<{ ok: boolean } | ReturnType<typeof demoBlock>> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!file) return { ok: false }
  dismissJob(db, postingId)
  deletePendingFind(file, postingId)
  revalidatePath('/')
  return { ok: true }
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
/** ISO shape, a real calendar day (2026-02-30 would roll into March), and a parseable instant. */
function isRealIsoDatetime(value: string): boolean {
  if (!ISO_DATETIME.test(value) || Number.isNaN(Date.parse(value))) return false
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d))
  return day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d
}

const MAIL_KINDS = ['acknowledged', 'screen', 'interview', 'rejected', 'offer'] as const
type MailKind = (typeof MAIL_KINDS)[number]

export type MailResult =
  | { ok: true }
  | { ok: false; error: string; code: 'agent-unavailable' | 'invalid' | 'gone' | 'bad-date' }
  | ReturnType<typeof demoBlock>

/**
 * "Del correo": the user confirms what an email an employer sent means and
 * which application it belongs to. The outcome is written exactly as the
 * satellite writes a tied one (note `gmail:<messageId> «quote»`, `at` the
 * email's own date), so Undo on the application finds it the same way.
 * Only an application still waiting on a reply is a valid target.
 */
export async function acceptMailSuggestionAction(
  suggestionId: string,
  applicationId: string,
  kind: string,
): Promise<MailResult> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!file) return { ok: false, error: 'Agent database not found.', code: 'agent-unavailable' }
  if (!(MAIL_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: 'Unknown outcome.', code: 'invalid' }
  }
  const suggestion = getMailSuggestion(file, String(suggestionId))
  if (!suggestion) return { ok: false, error: 'Already handled.', code: 'gone' }
  const app = getApplication(db, String(applicationId))
  // The satellite's own waiting set (waitingApps): applied or interviewing,
  // not archived, with an `applied` outcome to have been waiting since.
  if (
    !app ||
    app.archived ||
    (app.status !== 'applied' && app.status !== 'interviewing') ||
    !app.outcomes.some((o) => o.type === 'applied')
  ) {
    return { ok: false, error: 'Not a waiting application.', code: 'invalid' }
  }
  // Never date an outcome "now": the email's own date or nothing. The card
  // stays open so the user can dismiss it.
  if (!isRealIsoDatetime(suggestion.at)) {
    return { ok: false, error: 'The email date is not readable.', code: 'bad-date' }
  }
  const at = new Date(suggestion.at).toISOString()
  // Close first, so a double tap or a second tab cannot write the outcome twice.
  if (!closeMailSuggestion(file, suggestion.id, 'accepted')) {
    return { ok: false, error: 'Already handled.', code: 'gone' }
  }
  try {
    appendOutcome(db, app.id, {
      at,
      type: kind as MailKind,
      note: `gmail:${suggestion.messageId} «${suggestion.quote}»`,
    })
  } catch (e) {
    reopenMailSuggestion(file, suggestion.id)
    throw e
  }
  // Tied now, as the outcome pass ties a reply: the follow-up draft reads it.
  markMailOutcome(file, suggestion, app.id)
  revalidatePath('/')
  revalidatePath('/pipeline')
  revalidatePath(`/application/${app.id}`)
  return { ok: true }
}

/** Descartar on a "Del correo" card: the message stays seen, so it never comes back. */
export async function dismissMailSuggestionAction(suggestionId: string): Promise<MailResult> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!file) return { ok: false, error: 'Agent database not found.', code: 'agent-unavailable' }
  if (!closeMailSuggestion(file, String(suggestionId), 'dismissed')) {
    return { ok: false, error: 'Already handled.', code: 'gone' }
  }
  revalidatePath('/')
  return { ok: true }
}
