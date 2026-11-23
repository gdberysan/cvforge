'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { BottomNav } from '@/components/ui/BottomNav'
import { HapticsListener } from '@/components/ui/HapticsListener'
import { IconMark } from '@/components/ui/icons'
import { MomentHost } from '@/components/ui/MomentHost'
import { Nav } from '@/components/ui/Nav'
import { ToastHost } from '@/components/ui/ToastHost'
import { useDatabase } from '@/web/lib/database'
import { onJobs } from '@/web/lib/jobs'
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
            CVForge
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
            <p role="alert" className="form-error">
              {t('web.db.failed', { message: state.message })}
            </p>
          )}
        </main>
      </>
    )
  }

  const started = shell?.started ?? false
  return (
    <>
      <a href="#main" className="skip-link">
        {t('nav.skip')}
      </a>
      <Nav
        started={started}
        spendUsd={shell?.spendUsd ?? 0}
        demo={false}
        updateTo={null}
        discover={false}
        canQuit={false}
      />
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
