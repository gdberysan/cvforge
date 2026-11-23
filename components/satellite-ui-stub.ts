/**
 * `#satellite-ui` where the job agent is not part of the build: its pieces
 * render nothing. Also the contract the real pieces (components/satellite/)
 * are held to, prop for prop.
 */
import type { ReactNode } from 'react'
import type { FollowUpDraftView } from '@/lib/db/queries/drafts'
import type { FindCard, MailCard, WaitingApp } from '@/lib/satellite-types'
import type { ThreadCardView } from '@/lib/seguimiento-view'

/** An application's emails, as the agent read them. */
export function MailThread(_props: {
  applicationId: string
  cards: ThreadCardView[]
  count: number
  connected: boolean
}): ReactNode {
  return null
}

/** What the agent found and is waiting on you for (Hoy). */
export function AgentFinds(_props: { finds: FindCard[]; highlight: string | null }): ReactNode {
  return null
}

/** Employer emails the agent could not place (Hoy). */
export function MailSuggestions(_props: { cards: MailCard[]; waiting: WaitingApp[] }): ReactNode {
  return null
}

/** "Agente": marks what the agent read from the person's mail. */
export function AgentMark(): ReactNode {
  return null
}

/** The agent's chase kit being written for this application. */
export function KitProgress(_props: { applicationId: string }): ReactNode {
  return null
}

/** The newest follow-up draft the agent wrote for a quiet application. */
export function FollowUpDraft(_props: {
  applicationId: string
  draft: FollowUpDraftView | null
}): ReactNode {
  return null
}
