'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { IconChevron } from '@/components/ui/icons'
import { TARGETS } from '@/lib/prep/rehearse'
import { BEATS, type PrepStory } from '@/lib/schemas/prep'
import { AnswerBox, type SavedAnswer } from './AnswerBox'
import { FlagNote, LineNotes } from './LineNotes'
import { Rehearse } from './Rehearse'
import type { LineMarks } from './types'

/** The letter his answer is filed under, per beat (the prompt reads it). */
const PART = { situation: 'S', task: 'T', action: 'A', result: 'R' } as const

/**
 * The beats still only he can tell: empty in the prep and not yet written by
 * him (a saved part counts as told; review 2026-11-24).
 */
export function openBeats(
  story: PrepStory,
  saved: SavedAnswer[],
  beatName: (b: (typeof BEATS)[number]) => string,
) {
  return BEATS.filter(
    (b) =>
      story[b].text === '' &&
      !saved.some((a) => a.part === PART[b] && a.question === `${story.title}: ${beatName(b)}`),
  )
}

/**
 * One STAR story, in the one place it appears: the questions it answers on
 * top, then the story — short by default (what he glances at), four beats on
 * a spine when opened, the result given the most weight. A beat the record
 * lacks is an open slot to tell from memory, with questions to help him
 * recall — never filled in for him. Where it comes from is said once.
 */
export function StoryCard({
  story,
  questions,
  asks,
  markOpen = true,
  speech = 'es',
  answers = 0,
  applicationId,
  saved = [],
  labels,
  marks,
}: {
  story: PrepStory
  /** The questions this story answers, already rendered. */
  questions?: ReactNode
  /** Say "your part is missing" on the row; off when every story has one (it would tell nothing). */
  markOpen?: boolean
  /** The language the story is told in, for rehearsing it. */
  speech?: 'es' | 'en'
  /** The question to rehearse it against (the first it answers). */
  asks?: string
  /** How many questions it answers, for the closed row. */
  answers?: number
  /** For writing a part only he can tell; absent in a read-only view. */
  applicationId?: string
  saved?: SavedAnswer[]
  labels: Record<string, string>
  marks: LineMarks
}) {
  const t = useT()
  const locale = useLocale()
  const [short, setShort] = useState(true)
  const [rehearsing, setRehearsing] = useState(false)
  const missing = openBeats(story, saved, (b) => t(`prep.beat.${b}`))
  const open = missing.length > 0
  const cited = [...new Set(BEATS.flatMap((b) => story[b].citedEvidenceIds))]
  const self = useRef<HTMLDetailsElement>(null)
  // A link to this story ("Empieza por la primera") opens it, at its full
  // version when what it points at is the part only he can tell.
  useEffect(() => {
    const onHash = () => {
      if (location.hash !== `#story-${story.id}`) return
      if (self.current) self.current.open = true
      if (open) setShort(false)
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [story.id, open])
  return (
    // One open at a time (the browser's exclusive accordion): a list he
    // scans, each story opened where it sits.
    <details ref={self} className="prep-story" id={`story-${story.id}`} name="prep-story">
      <summary className="prep-story-row">
        <span className="prep-story-rowtext">
          <span className="prep-story-title">{story.title}</span>
          <span className="prep-story-meta">
            {answers > 1 && t('prep.story.count.other', { n: answers })}
            {answers > 1 && open && markOpen && ' · '}
            {open && markOpen && (
              <span className="prep-story-open">
                {t('prep.story.missing', {
                  what: missing.map((b) => t(`prep.beat.missing.${b}`)).join(t('prep.and')),
                })}
              </span>
            )}
          </span>
        </span>
        <span className="prep-story-chevron" aria-hidden="true">
          <IconChevron />
        </span>
      </summary>
      <div className="prep-story-body">
        {!rehearsing && questions}
        {/* One row: which version to read, or say it from memory. */}
        <div className="prep-story-tools">
          {!rehearsing && (
            <fieldset className="prep-toggle">
              <legend className="sr-only">{story.title}</legend>
              <button type="button" aria-pressed={short} onClick={() => setShort(true)}>
                {t('prep.story.short')}
              </button>
              <button type="button" aria-pressed={!short} onClick={() => setShort(false)}>
                {t('prep.story.full')}
              </button>
            </fieldset>
          )}
          <Rehearse
            question={asks ?? story.title}
            prepared={[...BEATS.map((b) => story[b].text), ...story.short].join(' ')}
            target={TARGETS.story}
            onActive={setRehearsing}
            language={speech}
          />
        </div>
        {/* Out of sight while he says it from memory. */}
        {!rehearsing &&
          (short ? (
            <>
              <ol className="prep-short">
                {story.short.map((line, i) => (
                  <li key={line}>
                    {line}
                    <FlagNote path={`stories.${story.id}.short.${i}`} marks={marks} />
                  </li>
                ))}
              </ol>
              {open && (
                <button type="button" className="prep-open-note" onClick={() => setShort(false)}>
                  {t('prep.story.openParts')}
                </button>
              )}
            </>
          ) : (
            <ol className="prep-spine">
              {BEATS.map((b) => {
                const beat = story[b]
                const path = `stories.${story.id}.${b}`
                const name = t(`prep.beat.${b}`)
                if (beat.text === '') {
                  return (
                    <li key={b} className="prep-beat is-open">
                      <span className="prep-dot" aria-hidden />
                      <p className="prep-beat-label">{t('prep.beat.fromMemory', { beat: name })}</p>
                      <div className="prep-slot">
                        {beat.ask && (
                          <p className="prep-slot-note">
                            {/* The model writes in the prep's language; the app speaks his. */}
                            {(speech === 'en') === (locale === 'en')
                              ? beat.ask
                              : t('prep.beat.askCode', { what: t(`prep.beat.missing.${b}`) })}
                          </p>
                        )}
                        <FlagNote path={`${path}.ask`} marks={marks} />
                        {beat.ideas.length > 0 && (
                          <>
                            <p className="prep-slot-ideas-h">{t('prep.beat.ideas')}</p>
                            <ul className="prep-slot-ideas">
                              {beat.ideas.map((i) => (
                                <li key={i}>{i}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {applicationId && (
                          <AnswerBox
                            applicationId={applicationId}
                            part={PART[b]}
                            question={`${story.title}: ${name}`}
                            evidenceIds={cited}
                            saved={saved.find(
                              (a) => a.part === PART[b] && a.question === `${story.title}: ${name}`,
                            )}
                          />
                        )}
                      </div>
                    </li>
                  )
                }
                const his = beat.citedEvidenceIds
                  .filter((id) => id.startsWith('answer:'))
                  .map((id) => saved.find((a) => `answer:${a.id}` === id))
                  .filter((a): a is SavedAnswer => a !== undefined)
                // Told only from his answer: his words, not a rewording of them.
                const onlyHis =
                  applicationId !== undefined &&
                  his.length > 0 &&
                  his.length === beat.citedEvidenceIds.length
                if (onlyHis) {
                  return (
                    <li key={b} className={`prep-beat${b === 'result' ? ' is-result' : ''}`}>
                      <span className="prep-dot" aria-hidden />
                      <p className="prep-beat-label">{name}</p>
                      {his.map((a) => (
                        <AnswerBox
                          key={a.id}
                          applicationId={applicationId}
                          part={a.part}
                          question={a.question}
                          saved={a}
                          bare
                        />
                      ))}
                    </li>
                  )
                }
                return (
                  <li key={b} className={`prep-beat${b === 'result' ? ' is-result' : ''}`}>
                    <span className="prep-dot" aria-hidden />
                    <p className="prep-beat-label">{name}</p>
                    <p className="prep-say">{beat.text}</p>
                    <LineNotes path={path} cited={[]} labels={labels} marks={marks} />
                    {/* Built on his own answer: his words stay visible and his to change. */}
                    {applicationId &&
                      his.map((a) => (
                        <AnswerBox
                          key={a.id}
                          applicationId={applicationId}
                          part={a.part}
                          question={a.question}
                          saved={a}
                        />
                      ))}
                  </li>
                )
              })}
            </ol>
          ))}
        {/* Where it comes from, after what it vouches for. */}
        <LineNotes path={`stories.${story.id}`} cited={cited} labels={labels} marks={marks} />
      </div>
    </details>
  )
}
