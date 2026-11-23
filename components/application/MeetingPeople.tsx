'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { hidePersonAction, savePersonAction } from '@/app/(app)/application/[id]/people-actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'
import { showToast } from '@/lib/ui/toast'

export type MeetingPerson = {
  id: string
  name: string
  email: string
  role: string
  roleQuote: string
  source: 'invite' | 'mail' | 'manual'
}

type Draft = { id?: string; name: string; email: string; role: string }

/** Only a web meeting link is ever offered. */
function safeMeetingUrl(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * Who he is meeting (spec 2026-10-18 Part A): names and stated roles from the
 * invite and the emails, the meeting link, and his own corrections — which
 * the email agent never overwrites.
 */
export function MeetingPeople({
  applicationId,
  people,
  meetingUrl,
}: {
  applicationId: string
  people: MeetingPerson[]
  meetingUrl: string | null
}) {
  const t = useT()
  const router = useRouter()
  const formId = useId()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, start] = useTransition()
  const join = safeMeetingUrl(meetingUrl)

  const [error, setError] = useState<string | null>(null)

  type Outcome = Awaited<ReturnType<typeof savePersonAction>>
  /** A failure says what did not happen; the demo keeps its own explanation. */
  const run = (act: () => Promise<Outcome>, failed: string, done: () => void) =>
    start(async () => {
      setError(null)
      let res: Outcome
      try {
        res = await act()
      } catch {
        res = { ok: false, error: '', code: 'unreachable' }
      }
      if (!res.ok) {
        setError(res.code === 'demo-read-only' ? errorText(t, res.code, res.error) : failed)
        return
      }
      done()
      router.refresh()
    })

  const save = () => {
    if (!draft) return
    run(
      () => savePersonAction({ applicationId, ...draft }),
      t('people.saveFailed'),
      () => {
        setDraft(null)
        showToast(t('people.saved'))
      },
    )
  }
  const remove = (p: MeetingPerson) =>
    run(
      () => hidePersonAction({ applicationId, id: p.id }),
      t('people.removeFailed', { name: p.name }),
      () => showToast(t('people.removed')),
    )

  return (
    <section className="people" aria-labelledby={`${formId}-h`}>
      <h3 id={`${formId}-h`} className="people-h">
        {t('people.title')}
      </h3>
      {people.length === 0 && !draft && <p className="people-empty">{t('people.empty')}</p>}
      <ul className="people-list">
        {people.map((p) => (
          <li key={p.id} className="people-row">
            <div className="people-who">
              <span className="people-name">{p.name}</span>
              <span className="people-role">{p.role || t('prep.roleUnknown')}</span>
              {p.roleQuote && (
                <details className="prep-quote">
                  <summary>{t('prep.roleSource')}</summary>
                  <p>“{p.roleQuote}”</p>
                </details>
              )}
            </div>
            <div className="people-actions">
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={t('people.edit', { name: p.name })}
                onClick={() => setDraft({ id: p.id, name: p.name, email: p.email, role: p.role })}
              >
                {t('meeting.edit')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={t('people.remove', { name: p.name })}
                disabled={pending}
                onClick={() => remove(p)}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="people-error">
          {error}
        </p>
      )}
      {draft ? (
        <div className="people-form">
          <label htmlFor={`${formId}-name`}>{t('people.name')}</label>
          <input
            id={`${formId}-name`}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <label htmlFor={`${formId}-role`}>{t('people.role')}</label>
          <input
            id={`${formId}-role`}
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          />
          <label htmlFor={`${formId}-email`}>{t('people.email')}</label>
          <input
            id={`${formId}-email`}
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
          <div className="people-form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !draft.name.trim()}
              onClick={save}
            >
              {t('people.save')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setDraft(null)}>
              {t('people.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-quiet people-add"
          onClick={() => setDraft({ name: '', email: '', role: '' })}
        >
          {t('people.add')}
        </button>
      )}
      {join && (
        <a
          className="btn btn-quiet prep-join"
          href={join}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('prep.join')}
        </a>
      )}
    </section>
  )
}
