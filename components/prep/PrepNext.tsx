'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { PrepContent } from '@/lib/schemas/prep'
import type { SavedAnswer } from './AnswerBox'
import { exposedGaps } from './Exposed'
import type { ReqChip } from './QuestionMap'
import { useReadiness } from './Readiness'
import { openBeats } from './StoryCard'

/**
 * The section's first line: where he stands and the one thing to do next.
 * In order: the must-have he lacks (have the honest answer ready), a story
 * missing his part, a question nothing answers yet, then rehearsing the
 * pitch. One step, one button: the rest of the prep is the reference.
 */
export function PrepNext({
  content,
  answers,
  requirements,
}: {
  content: PrepContent
  answers: SavedAnswer[]
  requirements: ReqChip[]
}) {
  const t = useT()
  const { st, total, story, gap, open } = useReadiness(content, answers, requirements)
  const ready = story + gap
  const reqs = new Map(requirements.map((r) => [r.id, r]))
  // A gap he wrote his own plan for is his; the step moves on.
  const planned = new Set(answers.filter((a) => a.part === 'P').map((a) => a.question))
  const gapFirst = exposedGaps(content, requirements).find(
    (g) => !planned.has(reqs.get(g.requirementId)?.keyword ?? ''),
  )
  const waiting = content.questions.find((q) => {
    const by = st.get(q.id)?.by
    return by === 'none' || by === 'personal'
  })
  // What is not ready comes first (a story missing his part, a question
  // with nothing yet); then the hard must-have to have clear; then rehearse.
  const next = open[0]
    ? {
        text: t('prep.next.story', {
          title: open[0].title,
          what: t(
            `prep.beat.missing.${openBeats(open[0], answers, (b) => t(`prep.beat.${b}`))[0] ?? 'task'}`,
          ),
        }),
        href: `#story-${open[0].id}`,
        action: t('prep.next.storyAction'),
      }
    : waiting
      ? {
          text: t('prep.next.question', { q: waiting.text }),
          href: '#prep-q-h',
          action: t('prep.answer.short'),
        }
      : gapFirst
        ? {
            text: t('prep.next.gap', { name: reqs.get(gapFirst.requirementId)?.keyword ?? '' }),
            href: `#gap-${gapFirst.id}`,
            action: t('prep.exposed.see'),
          }
        : content.pitch?.text
          ? {
              text: t('prep.next.rehearse'),
              href: '#prep-pitch-h',
              action: t('prep.rehearse.open'),
            }
          : null
  return (
    <section className="prep-next" aria-label={t('prep.ready.title')}>
      <p className="prep-next-count">
        <strong className="prep-next-num">{t('prep.next.num', { ready, total })}</strong>{' '}
        {t('prep.next.label')}
      </p>
      {next && (
        <div className="prep-next-step">
          <p className="prep-next-text">{next.text}</p>
          <a className="btn btn-primary prep-next-go" href={next.href}>
            {next.action}
          </a>
        </div>
      )}
    </section>
  )
}
