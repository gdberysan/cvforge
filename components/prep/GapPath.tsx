'use client'

import Link from 'next/link'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconChevron } from '@/components/ui/icons'
import { standings } from '@/lib/prep/standing'
import type { PrepContent } from '@/lib/schemas/prep'
import { AnswerBox, type SavedAnswer } from './AnswerBox'
import { FlagNote, LineNotes } from './LineNotes'
import { AsksLine, type ReqChip } from './QuestionMap'
import type { LineMarks } from './types'

/** A gap as three calm steps: say it, the nearest real thing, how you would close it. */
export function GapPath({
  content,
  requirements,
  labels,
  marks,
  applicationId,
  answers,
}: {
  applicationId: string
  answers: SavedAnswer[]
  content: PrepContent
  requirements: ReqChip[]
  labels: Record<string, string>
  marks: LineMarks
}) {
  const t = useT()
  if (content.gapAnswers.length === 0) return null
  const reqs = new Map(requirements.map((r) => [r.id, r]))
  // The questions each gap answers live in its card: one home, not two.
  const st = standings(content, answers, new Map(requirements.map((r) => [r.id, r.keyword])))
  const asked = (gapId: string) => content.questions.filter((q) => st.get(q.id)?.gapId === gapId)
  return (
    <section className="prep-section" aria-labelledby="prep-gap-h">
      <h2 id="prep-gap-h" className="prep-h2">
        {t('prep.gaps.title')}
      </h2>
      {content.gapAnswers.map((g) => (
        <article
          key={g.id}
          id={`gap-${g.id}`}
          className="prep-gap"
          aria-label={reqs.get(g.requirementId)?.keyword ?? g.id}
        >
          <h3 className="prep-gap-title">{reqs.get(g.requirementId)?.keyword}</h3>
          <AsksLine questions={asked(g.id)} reqs={reqs} />
          <ol className="prep-gap-steps">
            <li>
              <p className="prep-beat-label">{t('prep.gaps.admit')}</p>
              <p className="prep-say">{g.admit}</p>
              <FlagNote path={`gapAnswers.${g.id}.admit`} marks={marks} />
            </li>
          </ol>
          <details className="prep-gap-more">
            <summary>
              {t('prep.gaps.more')}
              <IconChevron />
            </summary>
            <ol className="prep-gap-steps">
              {g.bridge.text && (
                <li>
                  <p className="prep-beat-label">{t('prep.gaps.bridge')}</p>
                  <p className="prep-say">{g.bridge.text}</p>
                  <LineNotes
                    path={`gapAnswers.${g.id}.bridge`}
                    cited={g.bridge.citedEvidenceIds}
                    labels={labels}
                    marks={marks}
                  />
                </li>
              )}
              {(() => {
                const keyword = reqs.get(g.requirementId)?.keyword ?? ''
                const his = answers.find((a) => a.part === 'P' && a.question === keyword)
                // His own plan replaces the suggested one.
                return (
                  <li>
                    {!his && (
                      <>
                        <p className="prep-beat-label">{t('prep.gaps.plan')}</p>
                        <p className="prep-say">{g.plan}</p>
                        <FlagNote path={`gapAnswers.${g.id}.plan`} marks={marks} />
                      </>
                    )}
                    {keyword && (
                      <AnswerBox
                        applicationId={applicationId}
                        part="P"
                        question={keyword}
                        saved={his}
                        prompt={t('prep.gaps.writePlan')}
                      />
                    )}
                  </li>
                )
              })()}
            </ol>
            {/* Closing sits after what it hides, not between the claim and it. */}
            <button
              type="button"
              className="prep-gap-less"
              onClick={(e) => {
                const d = e.currentTarget.closest('details')
                if (d) d.open = false
              }}
            >
              {t('prep.gaps.less')}
              <IconChevron />
            </button>
          </details>
        </article>
      ))}
      <p className="prep-muted">
        {t('prep.gaps.addEvidence')} <Link href="/evidence">{t('prep.gaps.addEvidenceLink')}</Link>
      </p>
    </section>
  )
}
