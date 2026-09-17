import type { ApplicationStatus, OutcomeEvent, OutcomeType } from '@/lib/schemas'

const OUTCOME_TO_STATUS: Record<OutcomeType, ApplicationStatus> = {
  applied: 'applied',
  acknowledged: 'applied',
  screen: 'interviewing',
  interview: 'interviewing',
  offer: 'offer',
  rejected: 'closed',
  withdrawn: 'closed',
  ghosted: 'closed',
}

/**
 * The outcome log is the single source of truth. `applications.status` is a
 * denormalised column recomputed on every append, so the pipeline view can
 * filter and sort without replaying events.
 *
 * Sorted by date rather than array order: outcomes get logged out of sequence
 * in practice — you remember to record the rejection before the screen.
 */
export function deriveStatus(input: {
  outcomes: OutcomeEvent[]
  hasDocuments: boolean
  archived: boolean
}): ApplicationStatus {
  if (input.archived) return 'archived'

  if (input.outcomes.length === 0) {
    return input.hasDocuments ? 'drafting' : 'triaged'
  }

  const latest = [...input.outcomes].sort((a, b) => a.at.localeCompare(b.at)).at(-1)
  return latest ? OUTCOME_TO_STATUS[latest.type] : 'triaged'
}
