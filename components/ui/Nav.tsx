'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { formatUsd } from '@/lib/spend/cost'
import { LocaleSwitch } from './LocaleSwitch'
import { NavLink } from './NavLink'

/**
 * Two, and neither is the main thing. The main thing is the box on the home
 * page; these are where you go from an answer — what you are made of, and what
 * you have already asked about.
 */
const DESTINATIONS = [
  { href: '/evidence', key: 'nav.evidence' },
  { href: '/pipeline', key: 'nav.pipeline' },
  { href: '/stats', key: 'nav.stats' },
] as const

/**
 * Korven's nav, adapted: hexagonal "O" in the wordmark with the amber node at
 * its centre, mono section links, hairline base over a blurred sunken bar.
 */
export function Nav({
  started,
  spendUsd = 0,
  demo = false,
  updateTo = null,
}: {
  started: boolean
  spendUsd?: number
  /** Demo hides Settings and quit: there is no key to set, no server to own. */
  demo?: boolean
  /** A newer version's number, when the opt-in check found one. */
  updateTo?: string | null
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
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--surface-base)',
          textAlign: 'center',
          padding: 'var(--space-6)',
        }}
      >
        <div>
          <p className="eyebrow">CVForge</p>
          <h1 style={{ font: 'var(--type-h2)', marginTop: 'var(--space-3)' }}>
            {t('shutdown.title')}
          </h1>
          <p className="prose" style={{ marginTop: 'var(--space-3)', marginInline: 'auto' }}>
            {t('shutdown.body')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        // Tightens first, then wraps. A two-row sticky bar costs vertical
        // space on every screen, so it is the fallback rather than the plan —
        // but clipping the language switch off the edge is worse.
        gap: 'clamp(var(--space-3), 3vw, var(--space-7))',
        rowGap: 'var(--space-3)',
        flexWrap: 'wrap',
        padding: '18px clamp(20px, 5vw, 64px)',
        background: 'color-mix(in srgb, var(--surface-sunken) 72%, transparent)',
        backdropFilter: 'var(--blur-panel)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 19,
          letterSpacing: '-0.01em',
          color: 'var(--text-strong)',
        }}
      >
        CVF
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '0.72em',
            height: '0.82em',
            margin: '0 0.04em',
            background: 'var(--graphite-200)',
            clipPath: 'polygon(50% 0, 100% 27%, 100% 73%, 50% 100%, 0 73%, 0 27%)',
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 'var(--radius-pill)',
              background: 'var(--amber-500)',
              boxShadow: 'var(--glow-amber-sm)',
            }}
          />
        </span>
        RGE
      </Link>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          // The group itself must wrap too: five links plus the spend counter
          // and the language switch overflow a phone in one row, and an
          // overflowing sticky nav makes every page scroll sideways.
          flexWrap: 'wrap',
          rowGap: 'var(--space-2)',
          minWidth: 0,
          gap: 'clamp(var(--space-3), 3vw, var(--space-5))',
        }}
      >
        {started &&
          DESTINATIONS.map((d) => <NavLink key={d.href} href={d.href} label={t(d.key)} />)}
        {/* Always visible — the key is step one of the first run. Except in
            the demo, where there is no key to set. */}
        {!demo && <NavLink href="/settings" label={t('nav.settings')} />}
        {/* Running API spend (spec §5.4). Appears once the first real call
            lands; before that there is nothing to count. */}
        {spendUsd > 0 && (
          <span className="fact" title={t('nav.spend')}>
            <span className="sr-only">{t('nav.spend')} </span>
            {formatUsd(spendUsd)}
          </span>
        )}
        {updateTo && (
          <a
            href="https://github.com/gdberysan/cvforge/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="fact"
            style={{ color: 'var(--accent)' }}
          >
            {t('nav.update', { v: updateTo })}
          </a>
        )}
        <LocaleSwitch />
        {!demo && (
          <button type="button" className="action-quiet" onClick={quit} aria-live="polite">
            {t('nav.quit')}
            {quitFailed && (
              <span style={{ color: 'var(--signal-error)', marginLeft: 6 }}>
                {t('nav.quitFailed')}
              </span>
            )}
          </button>
        )}
      </div>
    </nav>
  )
}
