'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiFailure } from '@/lib/api-failure'
import { errorText } from '@/lib/i18n'
import type { PrepReport } from '@/lib/prep/verify'
import type { CVContent, DocumentLanguage } from '@/lib/schemas'
import type { PrepContent } from '@/lib/schemas/prep'
import type { InterviewView } from '@/lib/seguimiento-view'
import { readEventStream } from '@/lib/sse-client'
import { haptic } from '@/lib/ui/haptics'
import { DefendCv } from './DefendCv'
import { GapPath } from './GapPath'
import { type BriefPerson, PrepBriefing } from './PrepBriefing'
import { QuestionMap, type ReqChip } from './QuestionMap'
import { Readiness } from './Readiness'
import { StoryCard } from './StoryCard'
import { marksOf, type ShownPrep } from './types'

export type PrepView = {
  applicationId: string
  documentLanguage: DocumentLanguage
  /** The newest prep per language, if any. */
  preps: Partial<Record<DocumentLanguage, ShownPrep>>
  interview: InterviewView | null
  people: BriefPerson[]
  meetingUrl: string | null
  cv: CVContent | null
  cvIsSnapshot: boolean
  flaggedBulletIds: string[]
  requirements: ReqChip[]
  /** Each evidence id with the role or project it belongs to, for "From your record". */
  labels: Record<string, string>
}

type Stage = 'writing' | 'checking' | 'refining'

/** Prepárate (spec 2026-10-18): a guide to read before the call. Nothing to fill in. */
export function PrepStep({ view }: { view: PrepView }) {
  const t = useT()
  const router = useRouter()
  const [language, setLanguage] = useState<DocumentLanguage>(
    view.preps[view.documentLanguage] || !view.preps.en ? view.documentLanguage : 'en',
  )
  const [fresh, setFresh] = useState<Partial<Record<DocumentLanguage, ShownPrep>>>({})
  const [stage, setStage] = useState<Stage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const prep = fresh[language] ?? view.preps[language]

  const generate = async () => {
    setError(null)
    setStage('writing')
    try {
      const res = await fetch('/api/ai/prep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId: view.applicationId, language }),
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}))
        throw new ApiFailure(body.error ?? 'request failed', body.code)
      }
      await readEventStream(res.body, (e) => {
        if (typeof e.stage === 'string') setStage(e.stage as Stage)
        if (e.done === true) {
          setFresh((f) => ({
            ...f,
            [language]: {
              content: e.content as PrepContent,
              report: e.report as PrepReport,
              stale: false,
            },
          }))
        }
      })
      haptic('done')
      router.refresh()
    } catch (err) {
      haptic('failed')
      const code = err instanceof ApiFailure ? err.code : undefined
      setError(
        t('prep.failed', { reason: errorText(t, code, err instanceof Error ? err.message : '') }),
      )
    } finally {
      setStage(null)
    }
  }

  const controls = (
    <div className="prep-controls">
      <fieldset className="prep-lang">
        <legend className="sr-only">{t('prep.language')}</legend>
        {(['en', 'es-MX'] as const).map((l) => (
          <label key={l} className={language === l ? 'is-on' : undefined}>
            <input
              type="radio"
              name="prep-language"
              value={l}
              checked={language === l}
              onChange={() => setLanguage(l)}
            />
            {t(l === 'en' ? 'prep.lang.en' : 'prep.lang.es')}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className={prep ? 'btn btn-quiet' : 'btn btn-primary'}
        disabled={stage !== null}
        onClick={generate}
      >
        {t(prep ? 'prep.regenerate' : 'prep.generate')}
      </button>
      {stage && (
        <p className="prep-stage" role="status">
          {t(`prep.stage.${stage}`)}
        </p>
      )}
      {error && (
        <p className="prep-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )

  if (!prep) {
    return (
      <div className="prep">
        <PrepBriefing
          interview={view.interview}
          people={view.people}
          meetingUrl={view.meetingUrl}
          note=""
        />
        <p className="prep-intro">{t('prep.intro')}</p>
        {controls}
      </div>
    )
  }

  const { content } = prep
  const marks = marksOf(prep.report)
  const answers = (id: string) => content.questions.filter((q) => q.answeredBy === id).length
  return (
    <div className="prep has-content">
      <aside className="prep-side">
        <PrepBriefing
          interview={view.interview}
          people={view.people}
          meetingUrl={view.meetingUrl}
          note={content.interviewerNote}
          noteFlag={marks.flags.get('interviewerNote')}
        />
        <Readiness content={content} />
      </aside>
      <div className="prep-main">
        {prep.stale && <p className="prep-stale">{t('prep.stale')}</p>}
        <QuestionMap content={content} requirements={view.requirements} />
        <section className="prep-section" aria-labelledby="prep-stories-h">
          <h2 id="prep-stories-h" className="prep-h2">
            {t('prep.stories.title')}
          </h2>
          {content.stories.map((s) => (
            <StoryCard
              key={s.id}
              story={s}
              answers={answers(s.id)}
              labels={view.labels}
              marks={marks}
            />
          ))}
        </section>
        <DefendCv
          content={content}
          cv={view.cv}
          isSnapshot={view.cvIsSnapshot}
          flagged={view.flaggedBulletIds}
          labels={view.labels}
          marks={marks}
        />
        <GapPath
          content={content}
          requirements={view.requirements}
          labels={view.labels}
          marks={marks}
        />
        {controls}
      </div>
    </div>
  )
}
