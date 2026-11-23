'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { undoMailOutcomeAction } from '@/app/(app)/pipeline/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { outcomeTone } from '@/components/pipeline/OutcomeChip'
import { IconAgent, IconExternal } from '@/components/ui/icons'
import { errorText, type MessageKey, plural } from '@/lib/i18n'
import type { ThreadCardView } from '@/lib/seguimiento-view'
import { showToast } from '@/lib/ui/toast'

/**
 * "Correo", with "N correos" beside it (spec 2026-10-17 §1.3.3–5; layout
 * mockup Seguimiento2): every email the agent tied to this application,
 * newest first, as one grouped list — rows split by a hairline. An event
 * row is an outcome the agent logged from that email — its kind, the sentence it read, the "Agente" mark and
 * the way back (Undo, kept from the old strip: it deletes that event and the
 * status is derived again; the message stays seen, so it is not reapplied).
 * A plain row is an email alone. Every date arrives formatted by the server.
 */
export function MailThread({
  applicationId,
  cards,
  count,
  empty,
}: {
  applicationId: string
  cards: ThreadCardView[]
  count: number
  /** What to say when there is no email at all. */
  empty: string
}) {
  const t = useT()
  const router = useRouter()
  const headingId = useId()
  const [pending, start] = useTransition()
  const [gone, setGone] = useState<Set<string>>(new Set())
  const visible = cards.filter((c) => !c.outcomeId || !gone.has(c.outcomeId))

  const undo = (outcomeId: string) =>
    start(async () => {
      const out = await undoMailOutcomeAction(applicationId, outcomeId)
      if (out.ok) {
        setGone((g) => new Set(g).add(outcomeId))
        showToast(t('mail.undone'))
        router.refresh()
      } else {
        showToast(errorText(t, out.code, t('mail.failed')))
      }
    })

  // The visible word is "Gmail"; the name says what it does.
  const gmailLink = (href: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mail-open"
      aria-label={t('thread.openGmail')}
    >
      {t('thread.gmail')}
      <IconExternal />
    </a>
  )

  return (
    <section className="seg-block" aria-labelledby={headingId}>
      <div className="seg-head">
        <h3 id={headingId} className="seg-heading">
          {t('thread.heading')}
        </h3>
        {count > 0 && <span className="seg-head-meta">{plural(t, count, 'thread.count')}</span>}
      </div>
      {visible.length === 0 ? (
        <p className="seg-empty">{empty}</p>
      ) : (
        <ol className="seg-list">
          {visible.map((c) => {
            const tone = c.chip === 'mail' ? 'quiet' : outcomeTone(c.chip)
            return (
              <li key={c.key} className={`mail-row${c.kind === 'event' ? ' is-event' : ''}`}>
                <div className="mail-row-head">
                  <span className={`mail-kind tone-${tone}`}>
                    <span className="mail-kind-dot" aria-hidden />
                    {c.chip === 'mail' ? t('thread.mail') : t(`action.${c.chip}` as MessageKey)}
                  </span>
                  <time className="thread-date" dateTime={c.dateTime}>
                    {c.date}
                  </time>
                </div>
                {c.subject !== null && (
                  <p className="mail-subject">{c.subject || t('thread.noSubject')}</p>
                )}
                {/* On an event the Gmail link joins the foot's actions, so every
                    action of a row sits on one line. */}
                {(c.from || (c.link && c.kind !== 'event')) && (
                  <div className="mail-from-line">
                    {c.from && <span className="mail-from">{c.from}</span>}
                    {c.kind !== 'event' && c.link && gmailLink(c.link)}
                  </div>
                )}
                {c.quote && (
                  // A hand-written note may carry its own «»; never double them.
                  <blockquote className="mail-quote-line">
                    {c.quote.includes('«') ? c.quote : `«${wholeWords(c.quote)}»`}
                  </blockquote>
                )}
                {c.folded.length > 0 && (
                  <details className="thread-more">
                    <summary>{plural(t, c.folded.length, 'thread.more')}</summary>
                    <ul>
                      {c.folded.map((f) => (
                        <li key={f.key}>
                          <time className="thread-date" dateTime={f.dateTime}>
                            {f.date}
                          </time>
                          <a href={f.link} target="_blank" rel="noopener noreferrer">
                            {f.subject || t('thread.noSubject')}
                            <IconExternal />
                            <span className="sr-only"> · {t('thread.openGmail')}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {c.kind === 'event' && (
                  <div className="mail-row-foot">
                    <AgentMark />
                    <span className="mail-row-acts">
                      {c.link && gmailLink(c.link)}
                      {c.outcomeId && (
                        <button
                          type="button"
                          className="action-quiet mail-undo"
                          disabled={pending}
                          onClick={() => c.outcomeId && undo(c.outcomeId)}
                        >
                          {t('mail.undo')}
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/** Machine-read, not self-logged: the agent's spark and the word. */
export function AgentMark() {
  const t = useT()
  return (
    <span className="agent-mark">
      <IconAgent />
      <span aria-hidden>{t('thread.agent')}</span>
      <span className="sr-only">{t('thread.agentLabel')}</span>
    </span>
  )
}

/**
 * A stored quote is cut at 200 characters, often inside a word; shown, it
 * ends at the last whole word with "…" so it never reads like an error.
 */
function wholeWords(quote: string): string {
  const q = quote.trim()
  if (q.length < 190 || /[.!?…]$/.test(q)) return q
  const space = q.lastIndexOf(' ')
  return `${(space > 120 ? q.slice(0, space) : q).replace(/[\s,;:]+$/, '')}…`
}
