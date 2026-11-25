'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { PrepContent } from '@/lib/schemas/prep'
import { StoryCard } from './StoryCard'
import type { LineMarks } from './types'

export type ReqChip = {
  id: string
  keyword: string
  mandatory: boolean
  /** How well his experience covers it; older views lack it. */
  strength?: 'strong' | 'partial' | 'weak' | 'none'
}

function Question({
  q,
  reqs,
}: {
  q: PrepContent['questions'][number]
  reqs: Map<string, ReqChip>
}) {
  const t = useT()
  // Grouped by status, so the dot never separates a name from its own status.
  const named = q.requirementIds.flatMap((id) => {
    const r = reqs.get(id)
    return r ? [r] : []
  })
  const required = named.filter((r) => r.mandatory).map((r) => r.keyword)
  const nice = named.filter((r) => !r.mandatory).map((r) => r.keyword)
  return (
    <li className="prep-q">
      <span>{q.text}</span>
      {named.length > 0 && (
        <span className="prep-q-req">
          {required.length > 0 && (
            <span className="prep-q-group">
              <span className="prep-q-status">{t('prep.tags.required')}</span> {required.join(', ')}
            </span>
          )}
          {nice.length > 0 && (
            <span className="prep-q-group">
              <span className="prep-q-status">{t('prep.tags.nice')}</span> {nice.join(', ')}
            </span>
          )}
        </span>
      )}
      {q.know && (
        <span className="prep-q-know">
          <span className="prep-beat-label">{t('prep.know')}</span>
          <span>{q.know}</span>
          <span className="prep-q-req">{t('prep.knowSource')}</span>
        </span>
      )}
    </li>
  )
}

/**
 * The coverage grid drawn, not tabled: each story with the questions it
 * answers; the honest gap answers together; a question nothing answers
 * visibly on its own.
 */
export function QuestionMap({
  content,
  requirements,
  labels,
  marks,
}: {
  content: PrepContent
  requirements: ReqChip[]
  labels: Record<string, string>
  marks: LineMarks
}) {
  const t = useT()
  const reqs = new Map(requirements.map((r) => [r.id, r]))
  const byStory = (id: string) => content.questions.filter((q) => q.answeredBy === id)
  const gapIds = new Set(content.gapAnswers.map((g) => g.id))
  const viaGap = content.questions.filter((q) => gapIds.has(q.answeredBy))
  const uncovered = content.coverage.filter((c) => c.by === 'none').map((c) => c.questionId)
  const none = content.questions.filter((q) => uncovered.includes(q.id))
  return (
    <section className="prep-section" aria-labelledby="prep-q-h">
      <h2 id="prep-q-h" className="prep-h2">
        {t('prep.questions.title')}
      </h2>
      {/* Each story once: the questions it answers, then the story itself. */}
      {content.stories
        .filter((s) => byStory(s.id).length > 0)
        .map((s) => (
          <StoryCard
            key={s.id}
            story={s}
            answers={byStory(s.id).length}
            labels={labels}
            marks={marks}
            questions={
              <ul className="prep-qs">
                {byStory(s.id).map((q) => (
                  <Question key={q.id} q={q} reqs={reqs} />
                ))}
              </ul>
            }
          />
        ))}
      {viaGap.length > 0 && (
        <section className="prep-qcard is-gap" aria-labelledby="prep-q-gap">
          <h3 id="prep-q-gap" className="prep-qcard-title">
            {t('prep.questions.gapGroup')}
          </h3>
          <ul className="prep-qs">
            {viaGap.map((q) => (
              <Question key={q.id} q={q} reqs={reqs} />
            ))}
          </ul>
        </section>
      )}
      {none.length > 0 && (
        <section className="prep-qcard is-none" aria-labelledby="prep-q-none">
          <h3 id="prep-q-none" className="prep-qcard-title">
            {t('prep.questions.noneGroup')}
          </h3>
          <ul className="prep-qs">
            {none.map((q) => (
              <Question key={q.id} q={q} reqs={reqs} />
            ))}
          </ul>
          <p className="prep-muted">{t('prep.questions.noneHint')}</p>
        </section>
      )}
      {content.stories.some((s) => byStory(s.id).length === 0) && (
        <>
          <h3 className="prep-subhead">{t('prep.stories.more')}</h3>
          {content.stories
            .filter((s) => byStory(s.id).length === 0)
            .map((s) => (
              <StoryCard key={s.id} story={s} labels={labels} marks={marks} />
            ))}
        </>
      )}
    </section>
  )
}
