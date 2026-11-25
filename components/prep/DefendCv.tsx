'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconChevron } from '@/components/ui/icons'
import type { CVContent } from '@/lib/schemas'
import type { PrepContent } from '@/lib/schemas/prep'
import { AnswerBox, type SavedAnswer } from './AnswerBox'
import { LineNotes } from './LineNotes'
import type { LineMarks } from './types'

/** Each CV line as the interviewer reads it, the follow-up it invites, and what the record holds. */
export function DefendCv({
  content,
  cv,
  isSnapshot,
  flagged,
  labels,
  marks,
  applicationId,
  answers,
}: {
  applicationId: string
  answers: SavedAnswer[]
  content: PrepContent
  cv: CVContent | null
  isSnapshot: boolean
  flagged: string[]
  labels: Record<string, string>
  marks: LineMarks
}) {
  const t = useT()
  const bullets = new Map(
    (cv ? [...cv.experience, ...cv.projects].flatMap((s) => s.bullets) : []).map((b) => [
      b.id,
      b.text,
    ]),
  )
  const weak = new Set(flagged)
  // Open by default only where the line needs him; the rest wait a tap.
  const [all, setAll] = useState(false)
  const needs = (d: PrepContent['cvDefense'][number]) =>
    (d.unsupported?.length ?? 0) > 0 || weak.has(d.bulletId)
  const hidden = all
    ? 0
    : content.cvDefense.filter((d, i) => !(needs(d) || (!content.cvDefense.some(needs) && i === 0)))
        .length
  return (
    <section className="prep-section" aria-labelledby="prep-cv-h">
      <h2 id="prep-cv-h" className="prep-h2">
        {t('prep.cv.title')}
      </h2>
      {!cv ? (
        <p className="prep-muted">{t('prep.cv.none')}</p>
      ) : (
        <>
          <p className="prep-muted">
            {t('prep.cv.hint')}
            {!isSnapshot && ` ${t('prep.cv.notSnapshot')}`}
          </p>
          {content.cvDefense.length === 0 && <p className="prep-muted">{t('prep.cv.empty')}</p>}
          {content.cvDefense
            .filter((d, i) => all || needs(d) || (!content.cvDefense.some(needs) && i === 0))
            .map((d) => (
              // Folded to its CV line; open where the line needs him (a figure
              // his records lack, the weakest line): eight open cards were a wall.
              <details
                key={d.bulletId}
                className="prep-cvcard"
                open={(d.unsupported?.length ?? 0) > 0 || weak.has(d.bulletId)}
              >
                <summary className="prep-cvsummary">
                  {(d.line ?? bullets.get(d.bulletId)) ? (
                    <span className="prep-cvline">{d.line ?? bullets.get(d.bulletId)}</span>
                  ) : (
                    <span className="prep-muted">{t('prep.cv.lineGone')}</span>
                  )}
                  <span className="prep-story-chevron" aria-hidden="true">
                    <IconChevron />
                  </span>
                </summary>
                <div className="prep-cvbody">
                  {weak.has(d.bulletId) && <p className="prep-weak">{t('prep.cv.weakest')}</p>}
                  {d.unsupported && d.unsupported.length > 0 && (
                    <p className="prep-cvwarn" role="note">
                      {t('prep.cv.unsupported', { figures: d.unsupported.join(', ') })}
                    </p>
                  )}
                  {/* The same pattern as "Responde a:" elsewhere: label, then the question. */}
                  <p className="prep-asks-line">
                    <span className="prep-beat-label">{t('prep.cv.asks')}</span> {d.likelyQuestion}
                  </p>
                  {(() => {
                    const line = d.line ?? bullets.get(d.bulletId) ?? ''
                    const key = `«${line}»`
                    const his = line
                      ? answers.find((a) => a.part === 'C' && a.question.startsWith(key))
                      : undefined
                    const suggestion = (
                      <>
                        <p className="prep-beat-label">{t('prep.cv.facts')}</p>
                        <p className="prep-say">{d.facts.text}</p>
                        <LineNotes
                          path={`cvDefense.${d.bulletId}`}
                          cited={d.facts.citedEvidenceIds}
                          labels={labels}
                          marks={marks}
                        />
                      </>
                    )
                    const box = line && (
                      // Keyed to the line (stable) rather than the follow-up the
                      // model words afresh each time.
                      <AnswerBox
                        applicationId={applicationId}
                        part="C"
                        question={`${key} — ${d.likelyQuestion}`}
                        evidenceIds={d.facts.citedEvidenceIds}
                        saved={his}
                        prompt={t('prep.cv.write')}
                      />
                    )
                    // Once he wrote how he'd tell it, his words lead; the
                    // suggestion stays a tap away, not a second answer.
                    return his ? (
                      <>
                        {box}
                        <details className="prep-cv-suggestion">
                          <summary>
                            {t('prep.cv.suggestion')}
                            <IconChevron />
                          </summary>
                          {suggestion}
                        </details>
                      </>
                    ) : (
                      <>
                        {suggestion}
                        {box}
                      </>
                    )
                  })()}
                </div>
              </details>
            ))}
          {hidden > 0 && (
            <button type="button" className="prep-q-more" onClick={() => setAll(true)}>
              {t('prep.cv.more', { n: hidden })}
            </button>
          )}
        </>
      )}
    </section>
  )
}
