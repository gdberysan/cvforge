'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { BottomNav } from '@/components/ui/BottomNav'
import { BrandWord } from '@/components/ui/BrandWord'
import { HapticsListener } from '@/components/ui/HapticsListener'
import { IconMark } from '@/components/ui/icons'
import { MomentHost } from '@/components/ui/MomentHost'
import { Nav } from '@/components/ui/Nav'
import { ToastHost } from '@/components/ui/ToastHost'
import { useDatabase } from '@/web/lib/database'
import { InAppBrowserBanner } from '@/web/lib/in-app-browser'
import { onJobs } from '@/web/lib/jobs'
import { TrialOutSheet } from '@/web/lib/trial-out'
import { UnlockScreen } from '@/web/lib/unlock-screen'
import { useLoader } from '@/web/lib/use-loader'

/**
 * The desktop's app layout, in the browser: the same nav, bottom bar, toasts
 * and haptics, around screens that only render once this tab owns the data.
 * No quit (there is no server to stop), no update notice, no discover.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const t = useT()
  const { state, takeOver } = useDatabase()
  const shell = useLoader('shell')
  const [jobs, setJobs] = useState(0)
  const [seenInterrupted, setSeenInterrupted] = useState(false)
  useEffect(() => onJobs(setJobs), [])
  // Someone who uses the app skips the landing page next time (web/landing).
  const started = shell?.started ?? false
  useEffect(() => {
    if (!started) return
    try {
      localStorage.setItem('rumbo:returning', '1')
    } catch {}
  }, [started])

  if (state.kind === 'locked') return <UnlockScreen />
  if (state.kind !== 'ready') {
    return (
      <>
        {/* The same bar the app opens into, from the first frame: only what
            is under it changes when the data is ready, so nothing flashes. */}
        <nav className="topnav">
          <span className="brand-link">
            <span aria-hidden className="brand-mark">
              <IconMark />
            </span>
            <BrandWord />
          </span>
        </nav>
        <main id="main" className="page">
          {/* Opening takes a moment, not a screen: said only to screen readers. */}
          {state.kind === 'opening' && (
            <p className="sr-only" role="status">
              {t('web.db.opening')}
            </p>
          )}
          {(state.kind === 'busy' || state.kind === 'moved') && (
            <div className="stack">
              <p className="prose">{t(state.kind === 'busy' ? 'web.db.busy' : 'web.db.moved')}</p>
              <button type="button" className="btn btn-primary" onClick={takeOver}>
                {t('web.db.takeOver')}
              </button>
            </div>
          )}
          {state.kind === 'unsupported' && <p className="prose">{t('web.db.unsupported')}</p>}
          {state.kind === 'failed' && (
            <div className="stack">
              {/* What to do in the person's words; the browser's own
                  message (English, technical) only folded, for a report. */}
              <p role="alert" className="form-error">
                {t('web.db.failed')}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
                {t('web.db.reload')}
              </button>
              <details>
                <summary>{t('web.db.failedDetail')}</summary>
                <p className="prose">{state.message}</p>
              </details>
            </div>
          )}
        </main>
      </>
    )
  }

  return (
    <>
      <a href="#main" className="skip-link">
        {t('nav.skip')}
      </a>
      <Nav
        started={started}
        spendUsd={shell?.spendUsd ?? 0}
        trial={shell?.trial ?? false}
        demo={false}
        updateTo={null}
        discover={false}
        canQuit={false}
      />
      <InAppBrowserBanner />
      <TrialOutSheet />
      {jobs > 0 && (
        <p className="job-banner" role="status">
          {t('web.job.keepOpen')}
        </p>
      )}
      {state.interrupted > 0 && !seenInterrupted && (
        <div className="job-banner is-warning" role="alert">
          <span>{t('web.job.interrupted', { n: state.interrupted })}</span>
          <button type="button" className="btn btn-quiet" onClick={() => setSeenInterrupted(true)}>
            {t('ui.close')}
          </button>
        </div>
      )}
      {children}
      <BottomNav started={started} />
      <ToastHost />
      <MomentHost />
      <HapticsListener />
    </>
  )
}
