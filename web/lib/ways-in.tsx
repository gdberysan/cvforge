'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'

/**
 * How jobs get into Rumbo from where people actually look for them: the
 * Chrome extension on a computer, the share menu on an Android phone, the
 * home screen on an iPhone (iOS gives web apps no share target, so nothing
 * here promises one). Shown on Hoy as the one card that fits this device,
 * dismissible; and in Ajustes, both ways, always.
 *
 * The extension's store address is a build setting
 * (NEXT_PUBLIC_EXTENSION_URL): until the store approves it, the card says
 * it is coming instead of linking to a page that does not exist yet.
 */
export const EXTENSION_URL: string = process.env.NEXT_PUBLIC_EXTENSION_URL ?? ''

type Kind = 'extension' | 'android' | 'ios'
type Install = { prompt: () => Promise<void> }

const DISMISSED = (kind: Kind) => `rumbo:ways-in:${kind}:dismissed`

/** Which way fits this device, or null when none does (or one is already in use). */
function detect(): Kind | null {
  // Inside the extension's side panel: the extension is already in use.
  if (window.parent !== window) return null
  const ua = navigator.userAgent
  const installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  if (/iPhone|iPad|iPod/.test(ua)) return installed ? null : 'ios'
  if (/Android/.test(ua)) return installed ? null : 'android'
  // Chrome, Edge, Brave… on a computer: browsers that install Chrome extensions.
  const chromium =
    (
      navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }
    ).userAgentData?.brands?.some((b) => b.brand === 'Chromium') ?? /Chrome\//.test(ua)
  return chromium ? 'extension' : null
}

/** The browser's own install prompt, kept for the button (Android Chrome). */
function useInstallPrompt(): Install | null {
  const [deferred, setDeferred] = useState<Install | null>(null)
  useEffect(() => {
    const keep = (e: Event) => {
      e.preventDefault()
      setDeferred(e as unknown as Install)
    }
    window.addEventListener('beforeinstallprompt', keep)
    return () => window.removeEventListener('beforeinstallprompt', keep)
  }, [])
  return deferred
}

function Way({ kind, install }: { kind: Kind; install: Install | null }) {
  const t = useT()
  const [manual, setManual] = useState(false)
  if (kind === 'ios') {
    return (
      <div className="way">
        <h3 className="way-title">{t('waysIn.ios.title')}</h3>
        <p className="way-body">{t('waysIn.ios.body')}</p>
      </div>
    )
  }
  const steps =
    kind === 'extension'
      ? [t('waysIn.extension.step1'), t('waysIn.extension.step2'), t('waysIn.extension.step3')]
      : [t('waysIn.phone.step1'), t('waysIn.phone.step2'), t('waysIn.phone.step3')]
  return (
    <div className="way">
      <h3 className="way-title">
        {t(kind === 'extension' ? 'waysIn.extension.title' : 'waysIn.phone.title')}
      </h3>
      <p className="way-body">
        {t(kind === 'extension' ? 'waysIn.extension.body' : 'waysIn.phone.body')}
      </p>
      <ol className="way-steps">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {kind === 'extension' ? (
        EXTENSION_URL ? (
          <a
            className="btn btn-primary way-action"
            href={EXTENSION_URL}
            target="_blank"
            rel="noreferrer"
          >
            {t('waysIn.extension.add')}
          </a>
        ) : (
          <p className="way-soon">{t('waysIn.extension.soon')}</p>
        )
      ) : install && !manual ? (
        <button
          type="button"
          className="btn btn-primary way-action"
          onClick={() => install.prompt().catch(() => setManual(true))}
        >
          {t('waysIn.phone.install')}
        </button>
      ) : (
        <p className="way-soon">{t('waysIn.phone.manual')}</p>
      )}
    </div>
  )
}

/** Hoy: the one way that fits this device, until it is dismissed. */
export function WaysInCard() {
  const t = useT()
  const install = useInstallPrompt()
  const [kind, setKind] = useState<Kind | null>(null)
  useEffect(() => {
    const k = detect()
    let dismissed = false
    try {
      dismissed = k ? localStorage.getItem(DISMISSED(k)) === '1' : false
    } catch {}
    setKind(dismissed ? null : k)
  }, [])
  if (!kind) return null
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED(kind), '1')
    } catch {}
    setKind(null)
  }
  return (
    <section className="today-section ways-in" aria-labelledby="h-ways-in">
      <div className="today-section-head">
        <h2 id="h-ways-in">{t('waysIn.title')}</h2>
        <button type="button" className="action" onClick={dismiss}>
          {t('waysIn.dismiss')}
        </button>
      </div>
      <div className="ways-in-card">
        <Way kind={kind} install={install} />
      </div>
    </section>
  )
}

/** Ajustes: both ways, always, for whoever dismissed the card or looks later. */
export function WaysInSettings() {
  const install = useInstallPrompt()
  const [ios, setIos] = useState(false)
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent)), [])
  return (
    <div className="ways-in-list">
      <Way kind="extension" install={null} />
      <Way kind={ios ? 'ios' : 'android'} install={install} />
    </div>
  )
}
