'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { CostNote } from '@/components/ui/CostNote'
import { ApiFailure } from '@/lib/api-failure'
import { errorText } from '@/lib/i18n'
import type { PrepReport } from '@/lib/prep/verify'
import type { CVContent, DocumentLanguage } from '@/lib/schemas'
import type { PrepContent } from '@/lib/schemas/prep'
import type { InterviewView } from '@/lib/seguimiento-view'
import { readEventStream } from '@/lib/sse-client'
import { haptic } from '@/lib/ui/haptics'
import { AnswerBox, type SavedAnswer } from './AnswerBox'
import { AskThem } from './AskThem'
import { DefendCv } from './DefendCv'
import { Exposed, exposedGaps } from './Exposed'
import { GapPath } from './GapPath'
import { type BriefPerson, PrepBriefing } from './PrepBriefing'
import { PrepIndex } from './PrepIndex'
import { PrepNext } from './PrepNext'
import { PrepSheet, printSheet } from './PrepSheet'
import { QuestionMap, type ReqChip } from './QuestionMap'
import { Readiness } from './Readiness'
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
  /** What he wrote himself: parts of stories, answers to questions, notes after a round. */
  answers: SavedAnswer[]
  /** For the interview-day sheet's heading. */
  company: string
  requirements: ReqChip[]
  /** Each evidence id with the role or project it belongs to, for "From your record". */
  labels: Record<string, string>
}

type Stage = 'writing' | 'checking' | 'refining'

/** Prepárate (spec 2026-10-18): a guide to read before the call. */
export function PrepStep({ view }: { view: PrepView }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [language, setLanguage] = useState<DocumentLanguage>(
    view.preps[view.documentLanguage] || !view.preps.en ? view.documentLanguage : 'en',
  )
  const [fresh, setFresh] = useState<Partial<Record<DocumentLanguage, ShownPrep>>>({})
  const [stage, setStage] = useState<Stage | null>(null)
  // The longest wait in the app (3–5 minutes measured): a clock and the
  // truth about leaving, instead of a stage name alone.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (startedAt === null) return
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const [error, setError] = useState<string | null>(null)
  const prep = fresh[language] ?? view.preps[language]

  const generate = async () => {
    setError(null)
    setStage('writing')
    setStartedAt(Date.now())
    setElapsed(0)
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
      setStartedAt(null)
    }
  }

  const controls = (
    <div className="prep-controls">
      <fieldset className="prep-lang">
        <legend className="prep-lang-label">{t('prep.langPick')}</legend>
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
      <CostNote action="prep" />
      {stage && (
        <div className="prep-wait" role="status">
          <p className="prep-stage">
            {t(`prep.stage.${stage}`)}{' '}
            <span className="prep-wait-clock">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </span>
          </p>
          <p className="prep-wait-note">{t('prep.wait.note')}</p>
        </div>
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
        {/* Nothing to brief yet (no date, nobody named): "Qué sigue" asks for
            both, so an empty panel here would only repeat it. */}
        {(view.interview?.state === 'scheduled' || view.people.length > 0 || view.meetingUrl) && (
          <PrepBriefing
            interview={view.interview}
            people={view.people}
            meetingUrl={view.meetingUrl}
            note=""
          />
        )}
        <p className="prep-intro">{t('prep.intro')}</p>
        {controls}
      </div>
    )
  }

  const { content } = prep
  const marks = marksOf(prep.report)
  return (
    <div className="prep has-content">
      {/* The content follows the interview's language, the labels the app's:
          said once, so the mix reads as a choice, not a slip. */}
      {(language === 'en') !== (locale === 'en') && (
        <p className="prep-langnote">
          {t('prep.lang.note', {
            lang:
              locale === 'es'
                ? t(language === 'en' ? 'prep.lang.en' : 'prep.lang.es').toLocaleLowerCase('es')
                : t(language === 'en' ? 'prep.lang.en' : 'prep.lang.es'),
          })}
        </p>
      )}
      <PrepNext content={content} answers={view.answers} requirements={view.requirements} />

      {/* Who and when first (the time-critical part), then where he
          stands and the way around a long guide, which stay on screen. */}
      <aside className="prep-side">
        {/* On a phone, what needs him comes first. */}
        <PrepBriefing
          interview={view.interview}
          people={view.people}
          meetingUrl={view.meetingUrl}
          note={content.interviewerNote}
          noteFlag={marks.flags.get('interviewerNote')}
        />
        <Exposed content={content} requirements={view.requirements} placement="top" />
        {/* Pinned while the guide scrolls; the briefing above scrolls away. */}
        <div className="prep-rail">
          <Readiness content={content} answers={view.answers} requirements={view.requirements} />
          <PrepIndex
            content={content}
            exposed={exposedGaps(content, view.requirements).length > 0}
          />
          <div className="prep-sheet-cta is-rail">
            <button type="button" className="btn btn-quiet" onClick={printSheet}>
              {t('prep.sheet.button')}
            </button>
            <p className="prep-sheet-promise">{t('prep.sheet.promise')}</p>
          </div>
        </div>
      </aside>
      <div className="prep-main">
        {prep.stale && <p className="prep-stale">{t('prep.stale')}</p>}
        <Exposed content={content} requirements={view.requirements} />
        <QuestionMap
          content={content}
          requirements={view.requirements}
          labels={view.labels}
          marks={marks}
          applicationId={view.applicationId}
          answers={view.answers}
          speech={language.startsWith('es') ? 'es' : 'en'}
        />
        <DefendCv
          content={content}
          cv={view.cv}
          isSnapshot={view.cvIsSnapshot}
          flagged={view.flaggedBulletIds}
          labels={view.labels}
          marks={marks}
          applicationId={view.applicationId}
          answers={view.answers}
        />
        <GapPath
          content={content}
          requirements={view.requirements}
          labels={view.labels}
          marks={marks}
          applicationId={view.applicationId}
          answers={view.answers}
        />
        <AskThem content={content} />
        {/* After the call: what they asked and how it went, for the next round. */}
        <section className="prep-section" aria-labelledby="prep-debrief-h">
          <h2 id="prep-debrief-h" className="prep-h2">
            {t('prep.debrief.title')}
          </h2>
          <p className="prep-muted">{t('prep.debrief.hint')}</p>
          <div className="prep-debrief-card">
            <AnswerBox
              applicationId={view.applicationId}
              part="D"
              question={t('prep.debrief.question')}
              saved={view.answers.find((a) => a.part === 'D')}
              prompt={t('prep.debrief.open')}
            />
          </div>
        </section>
        <div className="prep-sheet-cta is-end">
          <button type="button" className="btn btn-quiet" onClick={printSheet}>
            {t('prep.sheet.button')}
          </button>
          <p className="prep-sheet-promise">{t('prep.sheet.promise')}</p>
        </div>
        {controls}
      </div>
      <PrepSheet
        content={content}
        people={view.people}
        requirements={view.requirements}
        company={view.company}
        answers={view.answers}
      />
    </div>
  )
}
