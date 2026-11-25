'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { IconMic } from '@/components/ui/icons'

/**
 * Dictation that never leaves the device. Chrome's ordinary speech
 * recognition streams the voice to Google's servers; this uses only the
 * on-device mode (`processLocally`), checked for his language when the page
 * loads, and offers the one-time language download Chrome needs. Where the
 * browser has no on-device mode the button never appears: the keyboard's
 * own microphone still works in the field.
 *
 * Never asked in an automated browser: headless Chromium 151 has no speech
 * service and asking crashed the page.
 */

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'
type Options = { langs: string[]; processLocally: boolean }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  processLocally: boolean
  onresult:
    | ((e: {
        resultIndex: number
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
      }) => void)
    | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
}
type RecognitionClass = {
  new (): Recognition
  available?: (o: Options) => Promise<Availability>
  install?: (o: Options) => Promise<boolean>
}

const LANGS = { es: ['es-MX', 'es-US', 'es-ES'], en: ['en-US', 'en-GB'] } as const

function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as RecognitionClass | undefined
  // Without the on-device check there is no way to keep the voice local.
  return SR && typeof SR.available === 'function' && 'processLocally' in SR.prototype ? SR : null
}

export function Dictate({
  onText,
  onListening,
  language,
}: {
  /** The language he will speak; defaults to the interface's. */
  language?: 'es' | 'en'
  /** Each finished phrase, as said. */
  onText: (text: string) => void
  onListening?: (on: boolean) => void
}) {
  const t = useT()
  const locale = useLocale()
  const [supported, setSupported] = useState(false)
  const [state, setState] = useState<'idle' | 'download' | 'downloading' | 'listening' | 'none'>(
    'idle',
  )
  const [lang, setLang] = useState<string | null>(null)
  // On a phone whose browser can't keep the voice local (Chrome 158 on a
  // Galaxy S25 said "unavailable" for every language, 2026-11-24) the button
  // must not exist at all: a button that only says "not available" is noise.
  const [installable, setInstallable] = useState(false)
  const rec = useRef<Recognition | null>(null)
  const want = language ?? (locale === 'es' ? 'es' : 'en')

  useEffect(() => {
    const SR = recognitionClass()
    // An automated browser has no speech service; asking crashed its page.
    if (!SR?.available || navigator.webdriver) return
    let live = true
    ;(async () => {
      for (const l of LANGS[want]) {
        try {
          const a = await SR.available?.({ langs: [l], processLocally: true })
          if (!live) return
          if (a === 'available' || a === 'downloadable' || a === 'downloading') {
            setLang(l)
            setInstallable(a !== 'available')
            setSupported(true)
            return
          }
        } catch {
          return
        }
      }
    })()
    return () => {
      live = false
    }
  }, [want])
  useEffect(() => () => rec.current?.stop(), [])

  if (!supported) return null

  const listen = (SR: RecognitionClass, l: string) => {
    const r = new SR()
    r.lang = l
    r.processLocally = true
    r.continuous = true
    r.interimResults = false
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res?.isFinal) {
          const text = res[0]?.transcript.trim()
          if (text) onText(text)
        }
      }
    }
    r.onend = () => {
      rec.current = null
      setState('idle')
      onListening?.(false)
    }
    r.onerror = (e) => {
      if (e.error === 'language-not-supported' || e.error === 'service-not-allowed')
        setState('none')
    }
    rec.current = r
    r.start()
    setState('listening')
    onListening?.(true)
  }

  const tap = () => {
    const SR = recognitionClass()
    if (!SR || !lang) return
    if (rec.current) {
      rec.current.stop()
      return
    }
    if (installable) {
      setState('download')
      return
    }
    listen(SR, lang)
  }

  const download = async () => {
    const SR = recognitionClass()
    if (!SR?.install || !lang) return
    setState('downloading')
    try {
      const ok = await SR.install({ langs: [lang], processLocally: true })
      if (ok) {
        setInstallable(false)
        listen(SR, lang)
      } else setState('none')
    } catch {
      setState('none')
    }
  }

  if (state === 'none') {
    return null
  }
  if (state === 'download' || state === 'downloading') {
    return (
      <div className="prep-dictate-download">
        <p className="prep-dictate-note">{t('prep.dictate.download')}</p>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={download}
          disabled={state === 'downloading'}
        >
          {t(state === 'downloading' ? 'prep.dictate.downloading' : 'prep.dictate.get')}
        </button>
      </div>
    )
  }
  const listening = state === 'listening'
  return (
    <span className="prep-dictate-row">
      <button
        type="button"
        className={`prep-dictate${listening ? ' is-listening' : ''}`}
        onClick={tap}
        aria-pressed={listening}
      >
        <IconMic />
        {t(listening ? 'prep.dictate.stop' : 'prep.dictate.start')}
      </button>
      <span className="prep-dictate-private">{t('prep.dictate.private')}</span>
    </span>
  )
}
