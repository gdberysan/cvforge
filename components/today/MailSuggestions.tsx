'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { acceptMailSuggestionAction, dismissMailSuggestionAction } from '@/app/(app)/agent/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { OutcomeChip } from '@/components/pipeline/OutcomeChip'
import { Meta } from '@/components/ui/Meta'
import { errorText } from '@/lib/i18n'
import { ago } from '@/lib/ui/ago'
import { haptic } from '@/lib/ui/haptics'
import { showToast } from '@/lib/ui/toast'

export type MailCard = {
  id: string
  at: string
  from: string
  subject: string
  quote: string
  /** The applications the agent could not choose between; empty when it found none. */
  candidates: { id: string; label: string }[]
}

export type WaitingApp = { id: string; label: string }

/** What an employer's email can mean, in the order a hiring process runs. */
const KINDS = ['acknowledged', 'screen', 'interview', 'rejected', 'offer'] as const

/**
 * Emails the agent could not place on its own (spec 2026-10-16 agent stage
 * B §4): which application, then what it means. Nothing is written until the
 * user taps an outcome; Descartar closes the card and the message is never
 * offered again.
 */
export function MailSuggestions({ cards, waiting }: { cards: MailCard[]; waiting: WaitingApp[] }) {
  const t = useT()
  const [gone, setGone] = useState<Set<string>>(new Set())
  const visible = cards.filter((c) => !gone.has(c.id))
  if (visible.length === 0) return null
  return (
    <section className="finds" aria-labelledby="mail-title">
      <h2 id="mail-title" className="eyebrow finds-title">
        {t('mail.title')}
      </h2>
      <ul className="finds-list">
        {visible.map((c) => (
          <li key={c.id}>
            <Suggestion
              card={c}
              waiting={waiting}
              onGone={() => setGone((g) => new Set(g).add(c.id))}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Suggestion({
  card: c,
  waiting,
  onGone,
}: {
  card: MailCard
  waiting: WaitingApp[]
  onGone: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [app, setApp] = useState<string>(c.candidates.length === 1 ? c.candidates[0].id : '')

  const fail = (out: { code?: string; error?: string }) =>
    showToast(errorText(t, out.code, out.error ?? t('mail.failed')))

  const accept = (kind: (typeof KINDS)[number]) =>
    start(async () => {
      const out = await acceptMailSuggestionAction(c.id, app, kind)
      if (out.ok) {
        haptic('confirm')
        showToast(t('outcome.logged', { outcome: t(`outcome.${kind}`) }))
        onGone()
        router.refresh()
      } else {
        fail(out)
        if (out.code === 'gone') onGone()
      }
    })

  const dismiss = () =>
    start(async () => {
      const out = await dismissMailSuggestionAction(c.id)
      if (out.ok || out.code === 'gone') onGone()
      else fail(out)
    })

  return (
    <article className="find-card">
      <h3 className="find-title">{c.subject}</h3>
      <p className="find-meta">
        <Meta>
          {t('mail.from', { from: c.from })}
          {ago(c.at, locale)}
        </Meta>
      </p>
      {c.quote && <blockquote className="mail-quote">{c.quote}</blockquote>}

      <div className="mail-group">
        <span className="mail-group-label" id={`mail-app-${c.id}`}>
          {t('mail.application')}
        </span>
        {c.candidates.length > 0 ? (
          // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a fieldset
          <div role="group" aria-labelledby={`mail-app-${c.id}`} className="mail-group">
            {c.candidates.map((a) => (
              <button
                key={a.id}
                type="button"
                className="mail-candidate"
                aria-pressed={app === a.id}
                onClick={() => setApp(a.id)}
                disabled={pending}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : (
          <select
            aria-labelledby={`mail-app-${c.id}`}
            className="flag-select mail-pick"
            value={app}
            onChange={(e) => setApp(e.target.value)}
            disabled={pending}
          >
            <option value="">{t('mail.pick')}</option>
            {waiting.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mail-group">
        <span className="mail-group-label">{t('mail.mark')}</span>
        {KINDS.map((k) => (
          <OutcomeChip key={k} type={k} onClick={() => accept(k)} disabled={pending || !app} />
        ))}
      </div>

      <div className="find-actions">
        <button type="button" className="btn btn-quiet" onClick={dismiss} disabled={pending}>
          {t('agent.dismiss')}
        </button>
      </div>
    </article>
  )
}
