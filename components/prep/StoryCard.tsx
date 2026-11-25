'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconChevron } from '@/components/ui/icons'
import { BEATS, type PrepStory } from '@/lib/schemas/prep'
import { FlagNote, LineNotes } from './LineNotes'
import type { LineMarks } from './types'

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
  answers = 0,
  labels,
  marks,
}: {
  story: PrepStory
  /** The questions this story answers, already rendered. */
  questions?: ReactNode
  /** How many questions it answers, for the closed row. */
  answers?: number
  labels: Record<string, string>
  marks: LineMarks
}) {
  const t = useT()
  const [short, setShort] = useState(true)
  const open = BEATS.some((b) => story[b].text === '')
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
            {answers > 0 &&
              t(answers === 1 ? 'prep.story.count.one' : 'prep.story.count.other', {
                n: answers,
              })}
            {answers > 0 && open && ' · '}
            {open && <span className="prep-story-open">{t('prep.story.ownParts')}</span>}
          </span>
        </span>
        <span className="prep-story-chevron" aria-hidden="true">
          <IconChevron />
        </span>
      </summary>
      <div className="prep-story-body">
        <LineNotes path={`stories.${story.id}`} cited={cited} labels={labels} marks={marks} />
        {questions && (
          <div className="prep-story-qs">
            <p className="prep-beat-label">{t('prep.story.asks')}</p>
            {questions}
          </div>
        )}
        <fieldset className="prep-toggle">
          <legend className="sr-only">{story.title}</legend>
          <button type="button" aria-pressed={short} onClick={() => setShort(true)}>
            {t('prep.story.short')}
          </button>
          <button type="button" aria-pressed={!short} onClick={() => setShort(false)}>
            {t('prep.story.full')}
          </button>
        </fieldset>
        {short ? (
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
                  <LineNotes path={path} cited={[]} labels={labels} marks={marks} />
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </details>
  )
}
