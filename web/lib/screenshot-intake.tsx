'use client'

/**
 * Screenshots of a posting in, its text out — the phone's way to analyse a
 * posting. Shared from Android (the service worker hands them over), or
 * picked here (iPhone, or a computer). Reading them is one paid call; the
 * button says so before it is pressed. The text then goes into the triage
 * console like any pasted posting, where it can be read and corrected
 * before the analysis.
 */
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { postingFromTranscript } from '@/lib/ai/stages/transcribe-posting'
import { errorText } from '@/lib/i18n'
import { workerApi } from './actions-client'
import { jobEnded, jobStarted } from './jobs'
import { MAX_TILES, prepareShots } from './screenshots'

/**
 * The way in when nothing is picked yet: a button that sits beside Analizar
 * inside the card (Hoy does the same), not a link loose above it.
 */
export function ShotsPicker({ onPick }: { onPick: (files: Blob[]) => void }) {
  const t = useT()
  return (
    <label className="btn btn-quiet shots-pick-btn">
      {t('triage.shots')}
      <input
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e: ChangeEvent<HTMLInputElement>) => onPick(Array.from(e.target.files ?? []))}
      />
    </label>
  )
}

export function ScreenshotIntake({
  initial,
  onText,
  files: controlled,
  onFiles,
}: {
  initial: Blob[]
  onText: (text: string, note: string) => void
  /** Held by the page when the picker lives elsewhere (ShotsPicker). */
  files?: Blob[]
  onFiles?: (files: Blob[]) => void
}) {
  const t = useT()
  const [own, setOwn] = useState<Blob[]>(initial)
  const files = controlled ?? own
  const setFiles = onFiles ?? setOwn
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(
    () => () => {
      for (const u of urls) URL.revokeObjectURL(u)
    },
    [urls],
  )

  async function read() {
    setBusy(true)
    setError(null)
    jobStarted()
    try {
      const { shots, dropped } = await prepareShots(files)
      const transcript = await (await workerApi()).transcribeScreenshots(shots)
      const text = postingFromTranscript(transcript)
      if (text.trim().length < 80) {
        setError(t('web.shots.nothing'))
        return
      }
      const notes = [
        transcript.unreadable ? t('web.shots.unreadable', { what: transcript.unreadable }) : '',
        dropped > 0 ? t('web.shots.dropped', { n: dropped, max: MAX_TILES }) : '',
      ].filter(Boolean)
      onText(text, notes.join(' '))
      setFiles([])
    } catch (err) {
      const e = err as { code?: string; message?: string }
      setError(errorText(t, e.code ?? 'unknown', e.message ?? ''))
    } finally {
      jobEnded()
      setBusy(false)
    }
  }

  return (
    <section className="shots" aria-label={t('web.shots.title')}>
      {files.length > 0 ? (
        <>
          <p className="fact">{t('web.shots.count', { n: files.length })}</p>
          <ul className="shots-strip">
            {urls.map((u, i) => (
              <li key={u}>
                {/* biome-ignore lint/performance/noImgElement: a local blob: preview of the person's own screenshot; there is nothing for next/image to optimise */}
                <img src={u} alt={t('web.shots.alt', { n: i + 1 })} />
              </li>
            ))}
          </ul>
          <div className="shots-actions">
            <button type="button" className="btn btn-primary" onClick={read} disabled={busy}>
              {busy ? t('web.shots.reading') : t('web.shots.read')}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setFiles([])}
              disabled={busy}
            >
              {t('web.shots.clear')}
            </button>
          </div>
          <p className="fact-label is-muted">{t('web.shots.cost')}</p>
          {/* The whole image goes to Anthropic, not just the posting: say so
              before the tap, while there is still time to crop. */}
          <p className="shots-privacy">{t('web.shots.privacy')}</p>
        </>
      ) : controlled ? null : (
        <label className="action shots-pick">
          {t('web.shots.pick')}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setFiles(Array.from(e.target.files ?? []))
              setError(null)
            }}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  )
}
