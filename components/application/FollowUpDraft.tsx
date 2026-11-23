'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { markDraftUsedAction } from '@/app/(app)/pipeline/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { gmailComposeUrl } from '@/lib/followup/gmail-url'
import { errorText } from '@/lib/i18n'
import { localeTag } from '@/lib/locale-tag'
import { haptic } from '@/lib/ui/haptics'
import { showToast } from '@/lib/ui/toast'

export type FollowUpDraftView = {
  id: string
  to: string
  subject: string
  body: string
  usedAt: string | null
}

/**
 * The newest follow-up draft for a quiet application (spec 2026-10-16 agent
 * stage B §5): copy it, or open it in Gmail's compose window. The user sends
 * it; "Ya lo envié" only records that he did.
 */
export function FollowUpDraft({
  applicationId,
  draft,
}: {
  applicationId: string
  draft: FollowUpDraftView | null
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [usedAt, setUsedAt] = useState<string | null>(draft?.usedAt ?? null)
  const [whole, setWhole] = useState(false)
  if (!draft) return null
  // A long email shows its opening; the rest is a tap away.
  const long = draft.body.length > 280 || draft.body.split('\n').length > 6

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      haptic('confirm')
      return true
    } catch {
      return false
    }
  }

  const copyAll = async () => {
    showToast(
      (await copy(`${draft.subject}\n\n${draft.body}`))
        ? t('followup.copied')
        : t('followup.copyFailed'),
    )
  }

  const openGmail = () => {
    const { url, bodyInUrl } = gmailComposeUrl(draft)
    // The copy starts before the window opens, and the window opens inside
    // the click: awaiting first would lose the gesture and the popup.
    const copied = bodyInUrl ? null : copy(draft.body)
    window.open(url, '_blank', 'noopener,noreferrer')
    if (copied) {
      void copied.then((ok) => showToast(ok ? t('followup.bodyCopied') : t('followup.copyFailed')))
    }
  }

  const markSent = () =>
    start(async () => {
      const out = await markDraftUsedAction(applicationId, draft.id)
      if (out.ok) {
        haptic('confirm')
        setUsedAt(out.usedAt)
        router.refresh()
      } else {
        showToast(errorText(t, out.code, t('followup.failed')))
      }
    })

  const sentDate = usedAt
    ? new Intl.DateTimeFormat(localeTag(locale), { dateStyle: 'long' }).format(new Date(usedAt))
    : ''

  return (
    <section className="followup" aria-label={t('followup.title')}>
      <h3 className="followup-title">{t('followup.title')}</h3>
      <p className="followup-to">
        {draft.to ? t('followup.to', { to: draft.to }) : t('followup.noTo')}
      </p>
      <p className="followup-subject">
        <span className="followup-label">{t('followup.subject')}</span>
        <span>{draft.subject}</span>
      </p>
      <p className={long && !whole ? 'followup-body is-clamped' : 'followup-body'}>{draft.body}</p>
      {long && (
        <button type="button" className="action followup-more" onClick={() => setWhole((w) => !w)}>
          {whole ? t('followup.less') : t('followup.more')}
        </button>
      )}
      {/* The one thing to do first; copy and Gmail beside it. */}
      <div className="followup-actions">
        {usedAt ? (
          <span className="followup-sent">{t('followup.sentOn', { date: sentDate })}</span>
        ) : (
          <button type="button" className="btn btn-primary" onClick={markSent} disabled={pending}>
            {t('followup.sent')}
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={openGmail}>
          {t('followup.open')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={copyAll}>
          {t('followup.copy')}
        </button>
      </div>
      <p className="followup-note">{t('followup.note')}</p>
    </section>
  )
}
