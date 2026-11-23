'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { CVContent } from '@/lib/schemas'
import type { PrepContent } from '@/lib/schemas/prep'
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
}: {
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
  return (
    <section className="prep-section" aria-labelledby="prep-cv-h">
      <h2 id="prep-cv-h" className="prep-h2">
        {t('prep.cv.title')}
      </h2>
      {!cv ? (
        <p className="prep-muted">{t('prep.cv.none')}</p>
      ) : (
        <>
          {!isSnapshot && <p className="prep-muted">{t('prep.cv.notSnapshot')}</p>}
          {content.cvDefense.length === 0 && <p className="prep-muted">{t('prep.cv.empty')}</p>}
          {content.cvDefense.map((d) => (
            <article key={d.bulletId} className="prep-cvcard">
              {(d.line ?? bullets.get(d.bulletId)) ? (
                <p className="prep-cvline">{d.line ?? bullets.get(d.bulletId)}</p>
              ) : (
                <p className="prep-muted">{t('prep.cv.lineGone')}</p>
              )}
              <div className="prep-cvbody">
                {weak.has(d.bulletId) && <p className="prep-weak">{t('prep.cv.weakest')}</p>}
                <p className="prep-likely">“{d.likelyQuestion}”</p>
                <p className="prep-beat-label">{t('prep.cv.facts')}</p>
                <p className="prep-say">{d.facts.text}</p>
                <LineNotes
                  path={`cvDefense.${d.bulletId}`}
                  cited={d.facts.citedEvidenceIds}
                  labels={labels}
                  marks={marks}
                />
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  )
}
