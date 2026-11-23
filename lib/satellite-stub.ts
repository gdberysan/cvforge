/**
 * `#satellite` where the job agent is not part of the build (the open-source
 * edition, the web edition): no agent, so nothing to show and nothing to
 * record. It is also the contract: the type checker reads these signatures
 * everywhere, the bundler swaps in lib/satellite/index.ts where that file
 * exists, and a private-only test holds the real entry to this shape.
 */
import type { ReactNode } from 'react'
import type { FindCard, MailAgent, MailCard } from '@/lib/satellite-types'

export function agentFinds(): FindCard[] {
  return []
}

export function mailSuggestions(_waiting: { id: string; label: string }[]): MailCard[] {
  return []
}

export function mailAgent(): MailAgent | null {
  return null
}

export function recordFollowUpSent(_draftId: string): void {}

/** The agent's line in Ajustes' "Cómo está todo". */
export function AgentStatusRow(): ReactNode | Promise<ReactNode> {
  return null
}

/** The agent's own group in Ajustes. */
export function AgentSettingsGroup(): ReactNode | Promise<ReactNode> {
  return null
}
