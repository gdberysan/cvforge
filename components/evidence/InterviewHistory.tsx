'use client'

import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { plural } from '@/lib/i18n'

export type InterviewSessionView = {
  id: string
  answers: { question: string; answer: string }[]
  createdAt: string
}

/**
 * One role's interview history — the verbatim Q&A from every accepted
 * session, newest first, collapsed by default. This exists because the
 * structured evidence a session produces is condensed CV-facing text; the
 * original question is what makes an old answer legible as "what did I
 * actually say about this role" months later. Native <details> for the
 * disclosure — no state, no library, and it degrades to "everything
 * visible" if JS never runs.
 */
export function InterviewHistory({ sessions }: { sessions: InterviewSessionView[] }) {
  const t = useT()
  const locale = useLocale()

  if (sessions.length === 0) return null

  const dateFormatter = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div style={{ marginTop: 'var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}>
      {sessions.map((session) => (
        <details
          key={session.id}
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
          }}
        >
          <summary className="fact-label" style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
            <span>
              {t('evidence.history.summary', {
                date: dateFormatter.format(new Date(session.createdAt)),
              })}
            </span>
            {' · '}
            <span>{plural(t, session.answers.length, 'evidence.history.count')}</span>
          </summary>
          <div
            className="stack"
            style={{ marginTop: 'var(--space-4)', gap: 'var(--space-4)', maxWidth: '38em' }}
          >
            {session.answers.map((qa) => (
              <div key={qa.question}>
                <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-strong)' }}>
                  {qa.question}
                </p>
                <p style={{ color: 'var(--text-body)', marginTop: 'var(--space-1)' }}>
                  {qa.answer}
                </p>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
