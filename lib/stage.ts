import type { ApplicationStatus, OutcomeEvent, OutcomeType } from '@/lib/schemas'

/**
 * Where an application stands, as four plain steps the user can read at a
 * glance (spec 2026-10-17 §3): analysed, documents written, sent, answered.
 * Pure, so server pages compute it and the track only draws it.
 */
export const STAGES = ['analysed', 'documents', 'sent', 'reply'] as const
export type Stage = (typeof STAGES)[number]

/**
 * How it ended, when it has: the last segment of the track takes this word
 * and tone instead of "Reply". `closed` covers a closed row whose closing
 * event is not known — never guessed into a rejection.
 */
export type StageEnd = 'offer' | 'rejected' | 'withdrawn' | 'ghosted' | 'archived' | 'closed'

/**
 * The furthest human answer the log proves: an interview, a call (a screen),
 * or a reply. The last step names it, so an application that ended after
 * three interviews never reads like one nobody answered.
 */
export type StageMilestone = 'reply' | 'call' | 'interview'

export type StagePosition = { stage: Stage; end: StageEnd | null; milestone: StageMilestone | null }

/** The newest event by date, not array order — outcomes get logged out of sequence. */
export function latestOutcome(
  outcomes: readonly Pick<OutcomeEvent, 'at' | 'type'>[],
): OutcomeType | null {
  return [...outcomes].sort((a, b) => a.at.localeCompare(b.at)).at(-1)?.type ?? null
}

/** Human answers that move a sent application to "Reply". */
const REPLY_TYPES = new Set<OutcomeType>(['acknowledged', 'screen', 'interview'])
const CLOSING = new Set<OutcomeType>(['rejected', 'withdrawn', 'ghosted'])

/**
 * What the log proves happened, for the stages a closing would otherwise
 * guess: was it sent, did a person answer. Read from the events, not the
 * status, which only says how it ended.
 */
export function stageFacts(outcomes: readonly Pick<OutcomeEvent, 'type'>[]): StageFacts {
  return {
    sent: outcomes.some((o) => o.type === 'applied'),
    replied: outcomes.some((o) => REPLY_TYPES.has(o.type)),
    milestone: outcomes.some((o) => o.type === 'interview')
      ? 'interview'
      : outcomes.some((o) => o.type === 'screen')
        ? 'call'
        : outcomes.some((o) => o.type === 'acknowledged')
          ? 'reply'
          : null,
  }
}

export type StageFacts = { sent: boolean; replied: boolean; milestone: StageMilestone | null }

const MILESTONE_OF: Partial<Record<OutcomeType, StageMilestone>> = {
  acknowledged: 'reply',
  screen: 'call',
  interview: 'interview',
}

export function stagePosition(
  status: ApplicationStatus,
  latest: OutcomeType | null = null,
  /** What the log proves (stageFacts) and whether a CV exists. Without it a
   *  closed row is drawn as sent, the old default. */
  facts?: Partial<StageFacts> & { hasCv?: boolean },
): StagePosition {
  const at = place(status, latest, facts)
  // Only the last step carries one; without the log, the newest event says
  // what it can. Never inferred from the status: a screen also makes a row
  // "interviewing".
  const milestone =
    at.stage === 'reply'
      ? (facts?.milestone ?? (latest ? (MILESTONE_OF[latest] ?? null) : null))
      : null
  return { ...at, milestone }
}

function place(
  status: ApplicationStatus,
  latest: OutcomeType | null,
  facts?: Partial<StageFacts> & { hasCv?: boolean },
): Omit<StagePosition, 'milestone'> {
  switch (status) {
    case 'archived':
      // Discarded after a CV was written: the CV step stays done.
      return { stage: facts?.hasCv ? 'documents' : 'analysed', end: 'archived' }
    case 'triaged':
      return { stage: 'analysed', end: null }
    case 'drafting':
      return { stage: 'documents', end: null }
    case 'applied':
      return { stage: latest && REPLY_TYPES.has(latest) ? 'reply' : 'sent', end: null }
    case 'interviewing':
      return { stage: 'reply', end: null }
    case 'offer':
      return { stage: 'reply', end: 'offer' }
    case 'closed':
      return {
        // An interview or a reply before the end is progress the track shows.
        stage: facts?.replied ? 'reply' : (facts?.sent ?? true) ? 'sent' : 'analysed',
        end: latest && CLOSING.has(latest) ? (latest as StageEnd) : 'closed',
      }
  }
}

/**
 * The outcomes one tap can log from here, four at most so they sit as an even
 * 2×2 grid. "No answer" is offered only once the silence is real (stale):
 * calling a two-day-old application ghosted is premature. Before sending,
 * the one move is "I sent it". After "no answer", a late reply.
 */
export function nextOutcomes(
  status: ApplicationStatus,
  opts: { stale?: boolean; latest?: OutcomeType | null } = {},
): OutcomeType[] {
  // Silence is the one ending that can turn out wrong: a reply can still
  // come. A no or a withdrawal is final.
  if (status === 'closed' && opts.latest === 'ghosted') {
    return ['acknowledged', 'screen', 'interview', 'rejected']
  }
  switch (status) {
    case 'triaged':
    case 'drafting':
      return ['applied']
    case 'applied':
      // Once they have answered, "they answered" is no longer news: the
      // next steps are a call, an interview, or the end.
      if (opts.latest === 'acknowledged') {
        return ['screen', 'interview', 'rejected', 'withdrawn']
      }
      return opts.stale
        ? ['acknowledged', 'screen', 'rejected', 'ghosted']
        : ['acknowledged', 'screen', 'interview', 'rejected']
    case 'interviewing':
      return ['interview', 'offer', 'rejected', 'ghosted']
    default:
      return []
  }
}
