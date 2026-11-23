'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { haptic } from '@/lib/ui/haptics'

/**
 * The browser inside LinkedIn, Instagram or Facebook keeps its own storage:
 * a CV read and a trial started there are not in Chrome or Safari the next
 * day, and the app may clear them. Rumbo's launch arrives as a LinkedIn
 * post, so most first visits open here. Said once, at the top, with the link
 * to copy into a real browser.
 */
const IN_APP: [RegExp, string][] = [
  [/LinkedInApp/i, 'LinkedIn'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
]

export function inAppBrowser(userAgent: string): string | null {
  return IN_APP.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
}

export function InAppBrowserBanner() {
  const t = useT()
  const [app, setApp] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => setApp(inAppBrowser(navigator.userAgent)), [])
  if (!app) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}`)
      setCopied(true)
      haptic('confirm')
    } catch {
      // No clipboard here: the address is in the text for a long press.
    }
  }

  return (
    <div className="job-banner is-warning" role="alert">
      <span>{t('web.inApp.lede', { app, url: location.host })}</span>
      <button type="button" className="btn btn-quiet" onClick={copy}>
        {copied ? t('web.inApp.copied') : t('web.inApp.copy')}
      </button>
    </div>
  )
}
