'use client'

import Link from 'next/link'
import { useT } from '@/components/i18n/LocaleProvider'
import type { PrepContent } from '@/lib/schemas/prep'
import { FlagNote, LineNotes } from './LineNotes'
import type { ReqChip } from './QuestionMap'
import type { LineMarks } from './types'

/** A gap as three calm steps: say it, the nearest real thing, how you would close it. */
export function GapPath({
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
  if (content.gapAnswers.length === 0) return null
  const reqs = new Map(requirements.map((r) => [r.id, r]))
  return (
    <section className="prep-section" aria-labelledby="prep-gap-h">
      <h2 id="prep-gap-h" className="prep-h2">
        {t('prep.gaps.title')}
      </h2>
      {content.gapAnswers.map((g) => (
        <article
          key={g.id}
          className="prep-gap"
          aria-label={reqs.get(g.requirementId)?.keyword ?? g.id}
        >
          <h3 className="prep-gap-title">{reqs.get(g.requirementId)?.keyword}</h3>
          <ol className="prep-gap-steps">
            <li>
              <p className="prep-beat-label">{t('prep.gaps.admit')}</p>
              <p className="prep-say">{g.admit}</p>
              <FlagNote path={`gapAnswers.${g.id}.admit`} marks={marks} />
            </li>
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
            <li>
              <p className="prep-beat-label">{t('prep.gaps.plan')}</p>
              <p className="prep-say">{g.plan}</p>
              <FlagNote path={`gapAnswers.${g.id}.plan`} marks={marks} />
            </li>
          </ol>
        </article>
      ))}
      <p className="prep-muted">
        {t('prep.gaps.addEvidence')} <Link href="/evidence">{t('prep.gaps.addEvidenceLink')}</Link>
      </p>
    </section>
  )
}
