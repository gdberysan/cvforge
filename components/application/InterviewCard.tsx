'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { setInterviewTimeAction } from '@/app/(app)/pipeline/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconCalendar } from '@/components/ui/icons'
import { callLine } from '@/lib/call-line'
import type { InterviewView } from '@/lib/seguimiento-view'
import { showToast } from '@/lib/ui/toast'
import { AgentMark } from './MailThread'

/**
 * What the action stores for the editor's two fields: a bare `YYYY-MM-DD`
 * when no time was given, else that wall time in the browser's zone as UTC
 * (`…Z`) — converted here, where the zone is known. null when unusable.
 */
export function toStoredTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (!time) return date
  if (!/^\d{2}:\d{2}$/.test(time)) return null
  const at = new Date(`${date}T${time}`)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/**
 * The interview to prepare for (spec 2026-10-17 §1.3.3): a calendar tile,
 * the weekday and time, and where the time came from — the agent's calendar
 * invite, said only when that is positively known. "Editar" opens the
 * browser's own date and (optional) time pickers; with no date known it asks
 * for one instead. Never invents a time.
 */
export function InterviewCard({
  applicationId,
  view,
}: {
  applicationId: string
  view: InterviewView
}) {
  const t = useT()
  const router = useRouter()
  const fieldId = useId()
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(view.state === 'scheduled' ? view.inputDate : '')
  const [time, setTime] = useState(view.state === 'scheduled' ? view.inputTime : '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const kindWord = t(view.kind === 'screen' ? 'action.screen' : 'action.interview')

  const save = (clear: boolean) => {
    setError(null)
    let iso: string | null = null
    if (!clear) {
      iso = toStoredTime(date, time)
      if (iso === null) {
        setError(t('meeting.invalid'))
        return
      }
    }
    start(async () => {
      const out = await setInterviewTimeAction(applicationId, view.outcomeId, iso)
      if (out.ok) {
        setEditing(false)
        showToast(t(iso ? 'meeting.saved' : 'meeting.cleared'))
        router.refresh()
      } else {
        // `not-found` here means "not an interview of this application" —
        // the generic "application no longer exists" would mislead.
        setError(out.code === 'demo-read-only' ? t('error.demo-read-only') : t('meeting.failed'))
      }
    })
  }

  const editor = (
    <form
      className="meeting-edit"
      onSubmit={(e) => {
        e.preventDefault()
        save(false)
      }}
    >
      <div className="meeting-edit-fields">
        <div className="meeting-edit-field">
          <label htmlFor={`${fieldId}-date`} className="meeting-edit-label">
            {t('meeting.field')}
          </label>
          <input
            id={`${fieldId}-date`}
            type="date"
            className="field meeting-field"
            value={date}
            min="2020-01-01"
            max="2100-12-31"
            required
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="meeting-edit-field">
          <label htmlFor={`${fieldId}-time`} className="meeting-edit-label">
            {t('meeting.timeField')}
          </label>
          <input
            id={`${fieldId}-time`}
            type="time"
            className="field meeting-field"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      <div className="meeting-edit-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {t('meeting.save')}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => {
            setEditing(false)
            setError(null)
          }}
        >
          {t('meeting.cancel')}
        </button>
        {view.state === 'scheduled' && (
          <button
            type="button"
            className="action-quiet meeting-clear"
            disabled={pending}
            onClick={() => save(true)}
          >
            {t('meeting.clear')}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="outcome-error">
          {error}
        </p>
      )}
    </form>
  )

  if (view.state === 'prompt') {
    return (
      <section className="meeting is-prompt" aria-label={kindWord}>
        <div className="meeting-ask">
          <span className="meeting-ask-icon">
            <IconCalendar />
          </span>
          <p className="meeting-ask-text">
            {t(view.kind === 'screen' ? 'meeting.askScreen' : 'meeting.askInterview')}
          </p>
          {!editing && (
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
              {t('meeting.add')}
            </button>
          )}
        </div>
        {editing && editor}
      </section>
    )
  }

  // The title is the shared call wording (lib/call-line), as on the overview
  // and the Postulaciones card; the line under it is the time, or "sin hora"
  // for a date-only value — no time is ever implied.
  return (
    <section className="meeting" aria-label={`${kindWord}, ${view.longDate}`}>
      <div className="meeting-main">
        <div className="meeting-tile" aria-hidden>
          <span className="meeting-tile-month">{view.month}</span>
          <span className="meeting-tile-day">{view.day}</span>
        </div>
        <div className="meeting-body">
          <p className={`meeting-title${view.daysFromToday < 0 ? ' is-past' : ''}`}>
            {callLine(t, view)}
          </p>
          <p className="meeting-meta">
            <span className="meeting-when">{view.time ?? t('meeting.noTime')}</span>
          </p>
          {/* Provenance only when positively known; otherwise nothing is claimed. */}
          {view.source === 'agent' && (
            <p className="meeting-source">
              <AgentMark />
              <span>{t('meeting.fromInvite')}</span>
            </p>
          )}
        </div>
        {!editing && (
          <button type="button" className="meeting-edit-btn" onClick={() => setEditing(true)}>
            {t('meeting.edit')}
          </button>
        )}
      </div>
      {editing && editor}
    </section>
  )
}
