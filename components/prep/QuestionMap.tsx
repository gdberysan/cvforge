'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { TARGETS } from '@/lib/prep/rehearse'
import { standings } from '@/lib/prep/standing'
import type { PrepContent } from '@/lib/schemas/prep'
import { AnswerBox, type SavedAnswer } from './AnswerBox'
import { LineNotes } from './LineNotes'
import { Rehearse } from './Rehearse'
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
        <details className="prep-q-know">
          <summary>{t('prep.know')}</summary>
          <span>{q.know}</span>
          <span className="prep-q-req">{t('prep.knowSource')}</span>
        </details>
      )}
    </li>
  )
}

/**
 * "Responde a: …" — one look in every card (story, pitch, gap): the label,
 * the questions, and the requirements they test on a quiet line below.
 */
export function AsksLine({
  questions,
  reqs,
}: {
  questions: PrepContent['questions']
  reqs: Map<string, ReqChip>
}) {
  const t = useT()
  if (questions.length === 0) return null
  const named = [...new Set(questions.flatMap((q) => q.requirementIds))].flatMap((id) => {
    const r = reqs.get(id)
    return r ? [r] : []
  })
  const required = named.filter((r) => r.mandatory).map((r) => r.keyword)
  const nice = named.filter((r) => !r.mandatory).map((r) => r.keyword)
  return (
    <div className="prep-asks">
      <p className="prep-asks-line">
        <span className="prep-beat-label">{t('prep.story.asks')}</span>{' '}
        {questions.map((q) => q.text).join(' · ')}
      </p>
      {named.length > 0 && (
        <p className="prep-q-req">
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
        </p>
      )}
      {/* Field knowledge a question tests: a tap away, said where it comes from. */}
      {questions
        .filter((q) => q.know)
        .map((q) => (
          <details key={q.id} className="prep-q-know">
            <summary>{t('prep.know')}</summary>
            <span>{q.know}</span>
            <span className="prep-q-req">{t('prep.knowSource')}</span>
          </details>
        ))}
    </div>
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
  applicationId,
  answers,
  speech,
}: {
  /** The prep's language: he rehearses in it. */
  speech: 'es' | 'en'
  content: PrepContent
  requirements: ReqChip[]
  applicationId: string
  answers: SavedAnswer[]
  labels: Record<string, string>
  marks: LineMarks
}) {
  const t = useT()
  // The pitch reads in full on a wide screen; a phone opens it on a tap.
  const [pitchOpen, setPitchOpen] = useState(false)
  const [pitchRehearsing, setPitchRehearsing] = useState(false)
  const reqs = new Map(requirements.map((r) => [r.id, r]))
  const byStory = (id: string) => content.questions.filter((q) => q.answeredBy === id)
  // One reading with the meter: where each question stands.
  const st = standings(content, answers, new Map(requirements.map((r) => [r.id, r.keyword])))
  const by = (q: PrepContent['questions'][number]) => st.get(q.id)?.by ?? 'none'
  const storyIds = new Set(content.stories.map((s) => s.id))
  // Questions he answered himself: linked by the prep (even reworded), or
  // still worded as when he wrote.
  const answerOf = (q: PrepContent['questions'][number]) =>
    answers.find((a) => `answer:${a.id}` === q.answeredBy) ??
    answers.find((a) => a.part === 'Q' && a.question === q.text)
  // His own written answers, wherever the prep put the question.
  const viaAnswer = content.questions.filter(
    (q) => q.answeredBy !== 'pitch' && !storyIds.has(q.answeredBy) && answerOf(q) !== undefined,
  )
  const shown = new Set(
    [...viaAnswer, ...content.questions].flatMap((q) => {
      const a = answerOf(q)
      return a ? [a.id] : []
    }),
  )
  const earlier = answers.filter((a) => a.part === 'Q' && !shown.has(a.id))
  const none = content.questions.filter((q) => by(q) === 'none')
  const personal = content.questions.filter((q) => by(q) === 'personal' && !answerOf(q))
  // Long groups show three; the rest on a tap (a phone read 14 screens).
  const [all, setAll] = useState<Record<string, boolean>>({})
  const few = <T,>(key: string, list: T[]) =>
    all[key] || list.length <= 3 ? list : list.slice(0, 2)
  const more = (key: string, n: number) =>
    n > 3 &&
    !all[key] && (
      <button
        type="button"
        className="prep-q-more"
        onClick={() => setAll((s) => ({ ...s, [key]: true }))}
      >
        {t('prep.questions.showAll', { n })}
      </button>
    )
  const ask = (q: PrepContent['questions'][number]) => (
    <li key={q.id} className="prep-q-answerable">
      <ul className="prep-qs">
        <Question q={q} reqs={reqs} />
      </ul>
      <AnswerBox
        applicationId={applicationId}
        part="Q"
        question={q.text}
        saved={answerOf(q)}
        prompt={t('prep.answer.short')}
      />
    </li>
  )
  return (
    <section className="prep-section" aria-labelledby="prep-q-h">
      <h2 id="prep-q-h" className="prep-h2">
        {t('prep.questions.title')}
      </h2>
      {/* "Tell me about yourself" comes first in nearly every interview. */}
      {content.pitch && content.pitch.text !== '' && (
        <article className="prep-pitch" aria-labelledby="prep-pitch-h">
          <h3 id="prep-pitch-h" className="prep-pitch-title">
            {t('prep.pitch.title')}
          </h3>
          <p className="prep-pitch-hint">{t('prep.pitch.hint')}</p>
          {!pitchRehearsing && <AsksLine questions={byStory('pitch')} reqs={reqs} />}
          {!pitchRehearsing && (
            <>
              <p className={`prep-say prep-pitch-text${pitchOpen ? '' : ' is-clamped'}`}>
                {content.pitch.text}
              </p>
              {!pitchOpen && (
                <button
                  type="button"
                  className="prep-pitch-more"
                  onClick={() => setPitchOpen(true)}
                >
                  {t('prep.note.more')}
                </button>
              )}
              <LineNotes
                path="pitch"
                cited={content.pitch.citedEvidenceIds}
                labels={labels}
                marks={marks}
              />
            </>
          )}
          <Rehearse
            question={byStory('pitch')[0]?.text ?? t('prep.pitch.title')}
            prepared={content.pitch.text}
            target={TARGETS.pitch}
            onActive={setPitchRehearsing}
            language={speech}
          />
        </article>
      )}
      {/* Each story once, as a row in one group: open it where it sits. */}
      {content.stories.some((s) => byStory(s.id).length > 0) && (
        <section className="prep-qcard is-stories" aria-labelledby="prep-q-stories">
          <h3 id="prep-q-stories" className="prep-qcard-title">
            {t('prep.questions.storiesGroup')}
          </h3>
          <div className="prep-story-list">
            {content.stories
              .filter((s) => byStory(s.id).length > 0)
              .map((s) => (
                <StoryCard
                  key={s.id}
                  story={s}
                  answers={byStory(s.id).length}
                  asks={byStory(s.id)[0]?.text}
                  speech={speech}
                  labels={labels}
                  marks={marks}
                  applicationId={applicationId}
                  saved={answers}
                  questions={<AsksLine questions={byStory(s.id)} reqs={reqs} />}
                />
              ))}
          </div>
        </section>
      )}
      {none.length > 0 && (
        <section className="prep-qcard is-none" aria-labelledby="prep-q-none">
          <h3 id="prep-q-none" className="prep-qcard-title">
            {t('prep.questions.noneGroup')}
          </h3>
          <p className="prep-muted">
            {t('prep.questions.noneHint')}{' '}
            <Link href="/evidence">{t('prep.gaps.addEvidenceLink')}</Link>
          </p>
          <ul className="prep-qs">{few('none', none).map(ask)}</ul>
          {more('none', none.length)}
        </section>
      )}
      {personal.length > 0 && (
        <section className="prep-qcard is-personal" aria-labelledby="prep-q-personal">
          <h3 id="prep-q-personal" className="prep-qcard-title">
            {t('prep.questions.personalGroup')}
          </h3>
          <ul className="prep-qs">{few('personal', personal).map(ask)}</ul>
          {more('personal', personal.length)}
        </section>
      )}
      {viaAnswer.length > 0 && (
        <section className="prep-qcard is-yours" aria-labelledby="prep-q-yours">
          <h3 id="prep-q-yours" className="prep-qcard-title">
            {t('prep.questions.yoursGroup')}
          </h3>
          <ul className="prep-qs">
            {viaAnswer.map((q) => (
              <li key={q.id} className="prep-q-answerable">
                <ul className="prep-qs">
                  <Question q={q} reqs={reqs} />
                </ul>
                <AnswerBox
                  applicationId={applicationId}
                  part="Q"
                  question={answerOf(q)?.question ?? q.text}
                  saved={answerOf(q)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* What he wrote for questions this prep no longer asks: still his, said where it came from. */}
      {earlier.length > 0 && (
        <section className="prep-qcard is-earlier" aria-labelledby="prep-q-earlier">
          <h3 id="prep-q-earlier" className="prep-qcard-title">
            {t('prep.questions.earlierGroup')}
          </h3>
          {earlier.map((a) => (
            <div key={a.id} className="prep-q-answerable">
              <p className="prep-q-earlier">{a.question}</p>
              <AnswerBox applicationId={applicationId} part="Q" question={a.question} saved={a} />
            </div>
          ))}
        </section>
      )}
      {content.stories.some((s) => byStory(s.id).length === 0) && (
        <>
          <h3 className="prep-subhead">{t('prep.stories.more')}</h3>
          {content.stories
            .filter((s) => byStory(s.id).length === 0)
            .map((s) => (
              <StoryCard
                key={s.id}
                story={s}
                labels={labels}
                marks={marks}
                applicationId={applicationId}
                saved={answers}
              />
            ))}
        </>
      )}
    </section>
  )
}
