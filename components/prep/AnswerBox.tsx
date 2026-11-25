'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  deletePrepAnswerAction,
  savePrepAnswerAction,
} from '@/app/(app)/application/[id]/prep-actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { IconEdit } from '@/components/ui/icons'
import type { PrepAnswer } from '@/lib/db/queries/prep'
import { formatDay } from '@/lib/ui/format-day'
import { haptic } from '@/lib/ui/haptics'
import { Dictate } from './Dictate'

export type SavedAnswer = Pick<PrepAnswer, 'id' | 'part' | 'question' | 'answer'> & {
  /** When he last saved it (an edit replaces the answer). */
  createdAt?: string
}

/**
 * Where he writes what only he knows: a part of a story, his answer to a
 * question, notes after a round. Saved as his own words — the next prep
 * may stand on them, in his words. Dictation here is on-device only
 * (`Dictate`); where the browser can't keep the voice local, the button
 * never shows and the keyboard's own microphone still works.
 */
export function AnswerBox({
  applicationId,
  part,
  question,
  evidenceIds = [],
  saved,
  prompt,
  bare = false,
}: {
  /** Inside a story step that already names it: no "Your answer" label. */
  bare?: boolean
  applicationId: string
  part: PrepAnswer['part']
  /** The slot this answer fills, as the prep will read it back. */
  question: string
  evidenceIds?: string[]
  saved?: SavedAnswer
  /** The open-button label; defaults to "Write your answer". */
  prompt?: string
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(saved?.answer ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // Just removed: one tap brings his words back.
  const [removed, setRemoved] = useState<string | null>(null)

  const save = (answer: string) =>
    start(async () => {
      setError(null)
      const r = await savePrepAnswerAction({ applicationId, part, question, answer, evidenceIds })
      if (!r.ok) {
        setError(r.error)
        return
      }
      // The server kept it: the one moment this box confirms.
      haptic('confirm')
      setEditing(false)
      setRemoved(null)
      router.refresh()
    })

  const remove = () =>
    start(async () => {
      if (!saved) return
      const r = await deletePrepAnswerAction({ applicationId, id: saved.id })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setRemoved(saved.answer)
      setText('')
      router.refresh()
    })

  if (saved && !editing) {
    return (
      <div className="prep-answer is-saved">
        {!bare && (
          <p className="prep-beat-label">
            {t(
              part === 'D'
                ? 'prep.answer.notes'
                : part === 'P'
                  ? 'prep.answer.plan'
                  : 'prep.answer.yours',
            )}
          </p>
        )}
        <p className="prep-answer-text">{saved.answer}</p>
        {saved.createdAt && (
          <p className="prep-answer-when">
            {t('prep.answer.savedOn', { day: formatDay(saved.createdAt, locale) })}
          </p>
        )}
        <div className="prep-answer-actions">
          <button type="button" className="prep-answer-link" onClick={() => setEditing(true)}>
            {t('prep.answer.edit')}
          </button>
          <button
            type="button"
            className="prep-answer-link is-quiet"
            onClick={remove}
            disabled={pending}
          >
            {t('prep.answer.remove')}
          </button>
        </div>
        {error && (
          <p className="prep-error" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  if (removed !== null && !editing) {
    return (
      <p className="prep-answer-removed" role="status">
        {t('prep.answer.removed')}{' '}
        <button
          type="button"
          className="prep-answer-link"
          disabled={pending}
          onClick={() => {
            setText(removed)
            save(removed)
          }}
        >
          {t('prep.answer.undo')}
        </button>
      </p>
    )
  }

  if (!editing) {
    return (
      <button type="button" className="prep-answer-open" onClick={() => setEditing(true)}>
        <IconEdit />
        {prompt ?? t('prep.answer.write')}
      </button>
    )
  }

  return (
    <form
      className="prep-answer is-editing"
      onSubmit={(e) => {
        e.preventDefault()
        save(text)
      }}
    >
      <label className="prep-beat-label" htmlFor={`ans-${part}-${question}`}>
        {t(
          part === 'D'
            ? 'prep.answer.notes'
            : part === 'P'
              ? 'prep.answer.plan'
              : 'prep.answer.yours',
        )}
        <span className="sr-only">: {question}</span>
      </label>
      <AutoTextarea
        id={`ans-${part}-${question}`}
        className="field prep-answer-field"
        value={text}
        minRows={3}
        maxLength={3000}
        placeholder={t('prep.answer.placeholder')}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="prep-answer-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending || text.trim().length === 0}
        >
          {pending ? t('prep.answer.saving') : t('prep.answer.save')}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setEditing(false)
            setText(saved?.answer ?? '')
          }}
        >
          {t('prep.answer.cancel')}
        </button>
        <Dictate onText={(said) => setText((s) => (s.trim() ? `${s.trimEnd()} ${said}` : said))} />
      </div>
      {error && (
        <p className="prep-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
