'use client'

import type { ReactNode } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import {
  IconAnalyse,
  IconDocument,
  IconHourglass,
  IconInbox,
  IconSend,
  IconVerified,
  IconXCircle,
} from '@/components/ui/icons'
import { STAGES, type Stage, type StageEnd, type StageMilestone } from '@/lib/stage'

const STAGE_ICON: Record<Stage, () => ReactNode> = {
  analysed: IconAnalyse,
  documents: IconDocument,
  sent: IconSend,
  reply: IconInbox,
}

const END_ICON: Partial<Record<StageEnd, () => ReactNode>> = {
  offer: IconVerified,
  rejected: IconXCircle,
  ghosted: IconHourglass,
}

/** Good news green, a no red, everything else that ended quietly grey. */
const END_TONE: Record<StageEnd, 'ok' | 'missing' | 'quiet'> = {
  offer: 'ok',
  rejected: 'missing',
  withdrawn: 'quiet',
  ghosted: 'quiet',
  archived: 'quiet',
  closed: 'quiet',
}

/**
 * Four equal segments — Analysed, Documents, Sent, Reply — filled up to where
 * the application stands, the current word bold. When it has ended, the last
 * segment takes the outcome's word and tone. Replaces the status pill: a
 * position on a path reads faster than a label. Takes an explicit position so
 * any page can draw it (`stagePosition` in lib/stage computes one).
 *
 * The last step names the furthest answer when there was one ("Interview"
 * instead of "Reply"); when it then ended, the ending sits under it in its
 * tone, so "Interview / Rejected" keeps both facts in four equal columns.
 */
export function StageTrack({
  stage,
  end = null,
  milestone = null,
}: {
  stage: Stage
  end?: StageEnd | null
  milestone?: StageMilestone | null
}) {
  const t = useT()
  const at = STAGES.indexOf(stage)
  const last = STAGES.length - 1
  const current = end ? last : at
  const reached = milestone ? t(`stage.milestone.${milestone}`) : null
  const label = (s: Stage, i: number) =>
    i !== last ? t(`stage.${s}`) : end ? t(`stage.end.${end}`) : (reached ?? t(`stage.${s}`))
  const spoken =
    end && reached ? `${reached}, ${t(`stage.end.${end}`)}` : label(STAGES[current], current)

  return (
    <div
      className={`stage-track${end ? ` ends tone-${END_TONE[end]}` : ''}`}
      role="img"
      aria-label={t('stage.aria', { stage: spoken })}
    >
      {STAGES.map((s, i) => {
        const isEnd = Boolean(end) && i === STAGES.length - 1
        const Glyph = (isEnd && end && END_ICON[end]) || STAGE_ICON[s]
        const state = isEnd ? 'is-end' : i <= at ? 'is-done' : 'is-todo'
        return (
          <div key={s} className={`stage-seg ${state}${i === current ? ' is-current' : ''}`}>
            {/* The icon leads its own bar, so the word below keeps the whole
                column: "Documentos" beside an icon overflowed a 390px phone. */}
            <Glyph />
            <span className="stage-bar" />
            {isEnd && reached ? (
              <span className="stage-word">
                <span className="stage-reached">{reached}</span>
                {label(s, i)}
              </span>
            ) : (
              <span className="stage-word">{label(s, i)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
