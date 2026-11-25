'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { standings } from '@/lib/prep/standing'
import type { PrepContent } from '@/lib/schemas/prep'
import type { SavedAnswer } from './AnswerBox'
import { openBeats } from './StoryCard'

/**
 * One segment per question, by what answers it; then how many stories need
 * his memory. Read with the same rules as the question groups (`standings`),
 * and counting what he wrote himself, so the meter moves when he answers.
 */
/** Where he stands, read once for the meter and the top line. */
export function useReadiness(
  content: PrepContent,
  answers: SavedAnswer[],
  requirements: { id: string; keyword: string }[],
) {
  const t = useT()
  const st = standings(content, answers, new Map(requirements.map((r) => [r.id, r.keyword])))
  // A question only he can answer (salary, motive) and has not: nothing yet.
  const open = content.stories.filter(
    (s) => openBeats(s, answers, (b) => t(`prep.beat.${b}`)).length > 0,
  )
  const unfinished = new Set(open.map((s) => s.id))
  // Ready means said: a question resting on a story still missing his part,
  // or one only he can answer and hasn't, is still to complete.
  const coverage = content.questions.map((q) => {
    const by = st.get(q.id)?.by ?? 'none'
    const toDo = by === 'personal' || (by === 'story' && unfinished.has(q.answeredBy))
    return { questionId: q.id, by: toDo ? ('none' as const) : by }
  })
  const total = coverage.length
  const story = coverage.filter((c) => c.by === 'story').length
  const gap = coverage.filter((c) => c.by === 'gap').length
  return { st, coverage, total, story, gap, none: total - story - gap, open }
}

export function Readiness({
  content,
  answers = [],
  requirements = [],
}: {
  content: PrepContent
  /** What he wrote since: a question he answered himself is answered. */
  answers?: SavedAnswer[]
  requirements?: { id: string; keyword: string }[]
}) {
  const t = useT()
  const { coverage, total, story, gap, none } = useReadiness(content, answers, requirements)
  const order = [...coverage].sort(
    (a, b) => ['story', 'gap', 'none'].indexOf(a.by) - ['story', 'gap', 'none'].indexOf(b.by),
  )
  return (
    <section className="prep-ready" aria-labelledby="prep-ready-h">
      <h2 id="prep-ready-h" className="prep-h2">
        {t('prep.ready.title')}
      </h2>
      <div
        className="prep-bar"
        role="img"
        aria-label={t('prep.ready.aria', { total, story, gap, none })}
      >
        {order.map((c) => (
          <span key={c.questionId} className={`prep-seg is-${c.by}`} />
        ))}
      </div>
      {/* The three tones named with their counts: the legend is the summary. */}
      <ul className="prep-legend">
        <li>
          <span className="prep-legend-dot is-story" aria-hidden="true" />
          {t('prep.ready.legend.story', { n: story })}
        </li>
        <li>
          <span className="prep-legend-dot is-gap" aria-hidden="true" />
          {t('prep.ready.legend.gap', { n: gap })}
        </li>
        <li>
          <span className="prep-legend-dot is-none" aria-hidden="true" />
          {t('prep.ready.legend.none', { n: none })}
        </li>
      </ul>
    </section>
  )
}
