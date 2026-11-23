'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { TriageConsole } from '@/components/triage/TriageConsole'
/**
 * Analizar in the browser: shared text or a pasted posting goes straight
 * into the triage console. Unlike the desktop, the web edition never fetches
 * a LinkedIn page itself — a shared LinkedIn link only fills in the URL, and
 * the posting arrives as text (or, on the phone, as screenshots).
 */
import { BackLink } from '@/components/ui/BackLink'
import { marketFromLocation } from '@/lib/discover/annotate'
import { defaultMarket } from '@/lib/markets'
import { resolveShared } from '@/lib/share/resolve'
import { type FramedPosting, useFramedPosting } from '@/web/lib/frame-signal'
import { GoTo } from '@/web/lib/go-home'
import { ScreenshotIntake, ShotsPicker } from '@/web/lib/screenshot-intake'
import { type SharedEntry, takeShared } from '@/web/lib/shared-shots'
import { useLoader } from '@/web/lib/use-loader'

function Share() {
  const t = useT()
  const params = useSearchParams()
  const markets = useLoader('markets')
  const shell = useLoader('shell')
  const sharedId = params.get('shared')
  // From the extension: the job in parts, first by the URL, then handed in
  // by the side panel as the person moves between jobs (no reload).
  const [job, setJob] = useState<{ n: number; posting: FramedPosting | null }>(() => ({
    n: 0,
    posting: params.get('job')
      ? {
          title: params.get('job') ?? '',
          company: params.get('company') ?? '',
          location: params.get('location') ?? '',
          url: params.get('url') ?? '',
          text: params.get('text') ?? '',
        }
      : null,
  }))
  useFramedPosting(job.n, (posting) => setJob((j) => ({ n: j.n + 1, posting })))
  const posting = job.posting
  // A share from Android's menu arrives through the service worker: its
  // screenshots and any link or text, taken once from IndexedDB.
  const [entry, setEntry] = useState<SharedEntry | null | undefined>(sharedId ? undefined : null)
  const [read, setRead] = useState<{ text: string; note: string; n: number } | null>(null)
  // Screenshots: shared in from Android, or picked with the button in the card.
  const [shots, setShots] = useState<Blob[] | null>(null)
  useEffect(() => {
    if (!sharedId) return
    takeShared(sharedId)
      .then(setEntry)
      .catch(() => setEntry(null))
  }, [sharedId])
  if (markets === undefined || entry === undefined || !shell) return null
  const raw = posting
    ? { text: postingText(posting), url: posting.url || undefined }
    : {
        title: params.get('title') ?? entry?.title ?? undefined,
        text: params.get('text') ?? entry?.text ?? undefined,
        url: params.get('url') ?? entry?.url ?? undefined,
      }
  const shared = resolveShared(raw)
  const fromShare = Boolean(raw.text || raw.url || raw.title || entry)
  // With the posting already in the box, the page asks for the press, not a paste.
  const ready = Boolean(read?.text) || shared.kind === 'text'
  const location = posting?.location || params.get('location')
  // Not set up yet. With nothing in hand, the first run is the one thing to
  // do; with a job already here (the extension, a share), it stays on screen
  // and the one action is to set up — never a box that fails after the work.
  if (!shell.started && !ready) return <GoTo href="/" />
  if (!shell.started) {
    return (
      <main id="main" tabIndex={-1} className="page share-page">
        <header className="page-head">
          <p className="eyebrow">{t('share.eyebrow')}</p>
          <h1 className="share-title">{t('share.titleShared')}</h1>
        </header>
        <div className="intake-card">
          {posting && (
            <article className="posting-card">
              {posting.company && <p className="posting-company">{posting.company}</p>}
              <h2 className="posting-title">{posting.title}</h2>
              {posting.location && <p className="posting-place">{posting.location}</p>}
            </article>
          )}
          <p className="intake-hint">{t('share.setupFirst')}</p>
          <div className="intake-actions">
            <Link href="/" className="btn btn-primary">
              {t('share.setupCta')}
            </Link>
          </div>
        </div>
      </main>
    )
  }
  return (
    <main id="main" tabIndex={-1} className="page share-page">
      <BackLink href="/" label={t('nav.today')} />
      <header className="page-head">
        <p className="eyebrow">{t('share.eyebrow')}</p>
        <h1 className="share-title">{t(fromShare ? 'share.titleShared' : 'share.title')}</h1>
      </header>
      {/* What you get, before the box asks for anything. */}
      <p className="exp-lede share-lede">{t(ready ? 'share.ledeReady' : 'share.lede')}</p>
      <ScreenshotIntake
        initial={[]}
        files={shots ?? entry?.files ?? []}
        onFiles={setShots}
        onText={(text, note) => setRead((r) => ({ text, note, n: (r?.n ?? 0) + 1 }))}
      />
      {read?.note && <p className="fact intake-note">{read.note}</p>}
      <TriageConsole
        // A new transcript is a new posting: the console starts over with it.
        key={read ? `shots-${read.n}` : `job-${job.n}`}
        defaultMarket={location ? marketFromLocation(location, markets) : defaultMarket(markets)}
        ownMarkets={markets}
        initialText={read?.text ?? (shared.kind === 'text' ? shared.text : '')}
        initialSourceUrl={shared.url}
        posting={
          posting && !read
            ? { ...posting, body: posting.text, url: shared.url ?? posting.url }
            : undefined
        }
        // A job already in hand needs one button, not a second way in.
        secondary={posting && !read ? undefined : <ShotsPicker onPick={setShots} />}
      />
    </main>
  )
}

/** The text Analizar reads: the job's heading lines, then its description. */
function postingText(p: FramedPosting): string {
  const head = [p.title, [p.company, p.location].filter(Boolean).join(' · ')]
    .filter(Boolean)
    .join('\n')
  return [head, p.text].filter(Boolean).join('\n\n')
}

export default function Page() {
  return (
    <Suspense>
      <Share />
    </Suspense>
  )
}
