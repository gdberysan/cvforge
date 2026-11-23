'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { BEATS, type PrepStory } from '@/lib/schemas/prep'
import { FlagNote, LineNotes } from './LineNotes'
import type { LineMarks } from './types'

/**
 * One STAR story as four beats on a spine, the result given the most
 * weight. A beat the record lacks is an open slot to tell from memory, with
 * questions to help him recall — never filled in for him.
 */
export function StoryCard({
  story,
  answers,
  labels,
  marks,
}: {
  story: PrepStory
  answers: number
  labels: Record<string, string>
  marks: LineMarks
}) {
  const t = useT()
  const [short, setShort] = useState(false)
  return (
    <article
      className="prep-story"
      id={`story-${story.id}`}
      aria-labelledby={`story-${story.id}-h`}
    >
      <h3 id={`story-${story.id}-h`} className="prep-story-title">
        {story.title}
      </h3>
      {answers > 0 && (
        <p className="prep-story-answers">
          {t(answers === 1 ? 'prep.story.answers.one' : 'prep.story.answers.other', { n: answers })}
        </p>
      )}
      <fieldset className="prep-toggle">
        <legend className="sr-only">{story.title}</legend>
        <button type="button" aria-pressed={!short} onClick={() => setShort(false)}>
          {t('prep.story.full')}
        </button>
        <button type="button" aria-pressed={short} onClick={() => setShort(true)}>
          {t('prep.story.short')}
        </button>
      </fieldset>
      {short ? (
        <ol className="prep-short">
          {story.short.map((line, i) => (
            <li key={line}>
              {line}
              <FlagNote path={`stories.${story.id}.short.${i}`} marks={marks} />
            </li>
          ))}
        </ol>
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
                    {beat.ask && <p className="prep-slot-note">{beat.ask}</p>}
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
                  </div>
                </li>
              )
            }
            return (
              <li key={b} className={`prep-beat${b === 'result' ? ' is-result' : ''}`}>
                <span className="prep-dot" aria-hidden />
                <p className="prep-beat-label">{name}</p>
                <p className="prep-say">{beat.text}</p>
                <LineNotes
                  path={path}
                  cited={beat.citedEvidenceIds}
                  labels={labels}
                  marks={marks}
                />
              </li>
            )
          })}
        </ol>
      )}
    </article>
  )
}
