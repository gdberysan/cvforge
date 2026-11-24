'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { addWorkAuthorizationAction } from '@/app/(app)/evidence/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { ApiFailure } from '@/lib/api-failure'
import { requestRemap } from '@/lib/gaps/remap-request'
import { errorText } from '@/lib/i18n'
import { authorizationPlace } from '@/lib/markets'
import type { Market } from '@/lib/schemas'
import { haptic } from '@/lib/ui/haptics'

/**
 * A posting gated on work authorization while the record says nothing about
 * it: most CVs never state it, so "not eligible" there means "not known".
 * The verdict is not softened — it is asked. Yes saves the person's answer
 * to their record and re-checks the posting (the mapping only, the posting
 * is not re-read); no leaves everything as it is.
 */
export function AuthAsk({
  requirement,
  market,
  postingRaw,
}: {
  requirement: string
  market: Market
  postingRaw: string
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [state, setState] = useState<'ask' | 'saving' | 'checking' | 'no'>('ask')
  const [error, setError] = useState<{ text: string; code?: string } | null>(null)
  const country = authorizationPlace(market, locale)
  if (state === 'no' || !country) return null

  async function yes() {
    setError(null)
    setState('saving')
    if (!country) return
    const saved = await addWorkAuthorizationAction({ country, status: t('authAsk.status') })
    if (!saved.ok) {
      setError({ text: errorText(t, saved.code, saved.error), code: saved.code })
      setState('ask')
      return
    }
    setState('checking')
    try {
      await requestRemap({ postingRaw, market })
      haptic('done')
      router.refresh()
    } catch (e) {
      haptic('failed')
      setError({
        text:
          e instanceof ApiFailure
            ? errorText(t, e.code, e.message)
            : e instanceof Error
              ? e.message
              : t('triage.failed'),
        code: e instanceof ApiFailure ? e.code : undefined,
      })
      setState('ask')
    }
  }

  const busy = state === 'saving' || state === 'checking'
  return (
    <section className="auth-ask" aria-labelledby="auth-ask-title">
      <p id="auth-ask-title" className="auth-ask-title">
        {t('authAsk.title', { country })}
      </p>
      <p className="auth-ask-body">{t('authAsk.body', { requirement })}</p>
      {error && <ErrorNote code={error.code}>{error.text}</ErrorNote>}
      <div className="auth-ask-actions" aria-live="polite">
        <button type="button" className="btn btn-primary" onClick={yes} disabled={busy}>
          {busy ? t('authAsk.checking') : t('authAsk.yes')}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setState('no')}
          disabled={busy}
        >
          {t('authAsk.no')}
        </button>
      </div>
    </section>
  )
}
