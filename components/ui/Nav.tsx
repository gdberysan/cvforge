'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { BrandWord } from '@/components/ui/BrandWord'
import { BRAND } from '@/lib/brand'
import { formatUsd } from '@/lib/spend/cost'
import { IconMark } from './icons'
import { LocaleSwitch } from './LocaleSwitch'
import { NavLink } from './NavLink'

/**
 * The same three places as the phone's bar (friendly redesign 2026-11-21).
 * The main thing is the box on Today; applications, base CVs and the numbers
 * open from Today, My experience and the spend pill.
 */
const DESTINATIONS = [
  { href: '/', key: 'nav.today' },
  { href: '/evidence', key: 'nav.evidence' },
] as const

/** The top bar: the mark and name, the places, your spend. */
export function Nav({
  started,
  spendUsd = 0,
  demo = false,
  updateTo = null,
  discover = false,
  canQuit = true,
  trial = false,
}: {
  started: boolean
  spendUsd?: number
  /** The web edition's free trial: Rumbo pays, so the bar says so, not a spend. */
  trial?: boolean
  /** Demo hides Settings and quit: there is no key to set, no server to own. */
  demo?: boolean
  /** A newer version's number, when the opt-in check found one. */
  updateTo?: string | null
  /** Personal-only discover page (spec 2026-08-26); off in every buyer build. */
  discover?: boolean
  /** Only the Mac itself may stop the server; from a phone the button would
   *  promise what /api/shutdown refuses (mac-only). */
  canQuit?: boolean
}) {
  const t = useT()
  const [off, setOff] = useState(false)
  const [quitFailed, setQuitFailed] = useState(false)

  // The packaged app has no terminal window to close; this is how it quits.
  // Data is already saved at every step, so no confirmation stands between
  // the click and the shutdown. The overlay only paints once the server
  // confirmed — painting first left a dead screen over a running app when
  // the request was refused.
  async function quit() {
    setQuitFailed(false)
    try {
      const res = await fetch('/api/shutdown', { method: 'POST' })
      if (res.ok) setOff(true)
      else setQuitFailed(true)
    } catch {
      // The process can die before the response flushes: that IS a shutdown.
      setOff(true)
    }
  }

  if (off) {
    return (
      <div className="shutdown">
        <div>
          <p className="eyebrow">{BRAND}</p>
          <h1 className="shutdown-title">{t('shutdown.title')}</h1>
          <p className="prose shutdown-body">{t('shutdown.body')}</p>
        </div>
      </div>
    )
  }

  return (
    // One row: the wordmark, then what you can reach; on a phone the
    // destinations live in the bottom bar and the language in Ajustes, so
    // the bar is the wordmark and your spend.
    <nav className={started ? 'topnav' : 'topnav is-new'}>
      <Link href="/" className="brand-link">
        <span aria-hidden className="brand-mark">
          <IconMark />
        </span>
        <BrandWord />
      </Link>

      <div className="topnav-links">
        {started &&
          DESTINATIONS.map((d) => <NavLink key={d.href} href={d.href} label={t(d.key)} />)}
        {started && discover && <NavLink href="/discover" label={t('nav.discover')} />}
        {/* Always visible — the key is step one of the first run. Except in
            the demo, where there is no key to set. */}
        {!demo && <NavLink href="/settings" label={t('nav.settings')} />}
        {/* Running API spend (spec §5.4), once the first real call lands;
            before that there is nothing to count. It opens the numbers. */}
        {trial && (
          <Link href="/settings" className="spend-pill trial-pill">
            {t('nav.trial')}
          </Link>
        )}
        {!trial && spendUsd > 0 && (
          <Link href="/stats" className="spend-pill">
            <span className="sr-only">{t('nav.spend')} </span>
            <span className="num">{formatUsd(spendUsd)}</span>
            <span className="spend-pill-word" aria-hidden>
              {t('nav.spendWord')}
            </span>
          </Link>
        )}
        {updateTo && (
          <a
            href="https://github.com/gdberysan/cvforge/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="update-pill"
          >
            {t('nav.update', { v: updateTo })}
          </a>
        )}
        <LocaleSwitch />
        {!demo && canQuit && (
          <button type="button" className="quit-pill" onClick={quit} aria-live="polite">
            {t('nav.quit')}
            {quitFailed && <span className="quit-failed">{t('nav.quitFailed')}</span>}
          </button>
        )}
      </div>
    </nav>
  )
}
