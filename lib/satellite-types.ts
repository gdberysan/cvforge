/**
 * The shapes of what the job agent (a personal-only satellite) hands the app,
 * as the core screens use them. Kept apart from the satellite itself so the
 * screens compile whether or not it is part of the build (see #satellite).
 */
import type { GroupTone, ToneRow } from '@/lib/requirement-tone'
import type { Source, Verdict } from '@/lib/schemas'

export type MailStatus = {
  state: 'connected' | 'revoked' | 'disconnected' | 'never' | 'disconnecting'
  account: string | null
  readAt: string | null
  alerts: boolean
  outcomes: boolean
  drafts: boolean
}

export type MailThreadItem = {
  messageId: string
  at: string
  from: string
  subject: string
  kind: string
  eventAt: string | null
  handledAs: string | null
  source: 'live' | 'history'
}

/** An employer email the agent could not place, as Hoy shows it. */
export type MailCard = {
  id: string
  at: string
  from: string
  subject: string
  quote: string
  /** The applications the agent could not choose between; empty when it found none. */
  candidates: { id: string; label: string }[]
}

export type WaitingApp = { id: string; label: string }

/** A posting the agent found, as Hoy's card and its preview sheet show it. */
export type FindCard = {
  postingId: string
  jobTitle: string
  company: string
  source: Source
  verdict: Verdict
  createdAt: string
  /** Mandatory requirements met, of how many. */
  strong: number
  total: number
  /** The posting's own paragraph (lib/role-summary); null leaves the block out. */
  summary: string | null
  /** The posting's language, for the verbatim summary's `lang`. */
  summaryLang: string
  /** The mandatory requirements' keywords, grouped by strength (lib/requirement-tone). */
  groups: { tone: GroupTone; rows: ToneRow[] }[]
  postingRaw: string
  /** Already checked http(s), or null. */
  sourceUrl: string | null
}

/** The agent's mail as an application page reads it. */
export type MailAgent = {
  status: () => MailStatus
  thread: (applicationId: string) => MailThreadItem[]
}
