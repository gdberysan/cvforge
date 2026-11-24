'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconClose } from '@/components/ui/icons'
import { copyText } from '@/lib/ui/copy'
import { haptic } from '@/lib/ui/haptics'
import { ANDROID_DOWNLOAD, IN_APP_BLOCKED, inAppBrowser, outsideUrl } from '@/lib/ui/in-app'

export { inAppBrowser } from '@/lib/ui/in-app'

/**
 * Said once, at the top of every page, inside LinkedIn's (or Instagram's,
 * Facebook's) own browser: what is saved here may not be there later, and
 * files cannot be downloaded here. The main action takes the person to their
 * real browser; when the app swallows that, the screen says where its menu
 * option is. A download tried here opens the same choice as a sheet instead
 * of a button that silently does nothing.
 */
export function InAppBrowserBanner() {
  const t = useT()
  const [app, setApp] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [hint, setHint] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [note, setNote] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setApp(inAppBrowser(navigator.userAgent))
    const onBlocked = () => setBlocked(true)
    let hide: ReturnType<typeof setTimeout> | undefined
    const onAndroidDownload = () => {
      setNote(true)
      clearTimeout(hide)
      hide = setTimeout(() => setNote(false), 15_000)
    }
    window.addEventListener(IN_APP_BLOCKED, onBlocked)
    window.addEventListener(ANDROID_DOWNLOAD, onAndroidDownload)
    return () => {
      window.removeEventListener(IN_APP_BLOCKED, onBlocked)
      window.removeEventListener(ANDROID_DOWNLOAD, onAndroidDownload)
      clearTimeout(hide)
    }
  }, [])

  useEffect(() => {
    if (blocked) sheet.current?.focus()
  }, [blocked])

  // After a download on Android: inside LinkedIn's tab it silently fails.
  const downloadNote = note && (
    <div className="undo-bar is-note" role="status">
      <span className="undo-label">{t('web.download.androidNote')}</span>
      <button
        type="button"
        className="undo-close"
        onClick={() => setNote(false)}
        aria-label={t('undo.dismiss')}
      >
        <IconClose />
      </button>
    </div>
  )

  if (!app) return downloadNote || null
  const here = () => `${location.origin}${location.pathname}`

  function open() {
    const target = outsideUrl(here(), navigator.userAgent)
    if (!target) return setHint(true)
    location.href = target
    // Still here a moment later: the app kept the page. Point at its menu.
    setTimeout(() => {
      if (document.visibilityState === 'visible') setHint(true)
    }, 1500)
  }

  async function copy() {
    if (await copyText(here())) {
      setCopied(true)
      haptic('confirm')
    } else setHint(true)
  }

  const actions = (
    <div className="in-app-actions">
      <button type="button" className="btn btn-primary" onClick={open}>
        {t('web.inApp.open')}
      </button>
      <button type="button" className="btn btn-quiet" onClick={copy}>
        {copied ? t('web.inApp.copied') : t('web.inApp.copy')}
      </button>
    </div>
  )

  return (
    <>
      {downloadNote}
      <div className="job-banner is-warning in-app-banner" role="alert">
        <span>{t('web.inApp.lede', { app, url: location.host })}</span>
        {actions}
        {hint && <span className="in-app-hint">{t('web.inApp.menuHint', { app })}</span>}
      </div>
      {blocked && (
        <div className="in-app-scrim">
          <div
            ref={sheet}
            className="in-app-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="in-app-sheet-title"
            tabIndex={-1}
            onKeyDown={(e) => e.key === 'Escape' && setBlocked(false)}
          >
            <h2 id="in-app-sheet-title">{t('web.inApp.blockedTitle', { app })}</h2>
            <p>{t('web.inApp.blockedBody', { app })}</p>
            {actions}
            {hint && <p className="in-app-hint">{t('web.inApp.menuHint', { app })}</p>}
            <button type="button" className="btn btn-ghost" onClick={() => setBlocked(false)}>
              {t('web.inApp.notNow')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
