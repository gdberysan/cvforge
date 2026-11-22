'use client'

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
import { defaultMarket } from '@/lib/markets'
import { resolveShared } from '@/lib/share/resolve'
import { ScreenshotIntake, ShotsPicker } from '@/web/lib/screenshot-intake'
import { type SharedEntry, takeShared } from '@/web/lib/shared-shots'
import { useLoader } from '@/web/lib/use-loader'

function Share() {
  const t = useT()
  const params = useSearchParams()
  const markets = useLoader('markets')
  const sharedId = params.get('shared')
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
  if (markets === undefined || entry === undefined) return null
  const raw = {
    title: params.get('title') ?? entry?.title ?? undefined,
    text: params.get('text') ?? entry?.text ?? undefined,
    url: params.get('url') ?? entry?.url ?? undefined,
  }
  const shared = resolveShared(raw)
  const fromShare = Boolean(raw.text || raw.url || raw.title || entry)
  return (
    <main id="main" tabIndex={-1} className="page share-page">
      <BackLink href="/" label={t('nav.today')} />
      <h1 className="share-title">{t(fromShare ? 'share.titleShared' : 'share.title')}</h1>
      {/* What you get, before the box asks for anything. */}
      <p className="exp-lede share-lede">{t('share.lede')}</p>
      <ScreenshotIntake
        initial={[]}
        files={shots ?? entry?.files ?? []}
        onFiles={setShots}
        onText={(text, note) => setRead((r) => ({ text, note, n: (r?.n ?? 0) + 1 }))}
      />
      {read?.note && <p className="fact intake-note">{read.note}</p>}
      <TriageConsole
        // A new transcript is a new posting: the console starts over with it.
        key={read ? `shots-${read.n}` : 'blank'}
        defaultMarket={defaultMarket(markets)}
        ownMarkets={markets}
        initialText={read?.text ?? (shared.kind === 'text' ? shared.text : '')}
        initialSourceUrl={shared.url}
        secondary={<ShotsPicker onPick={setShots} />}
      />
    </main>
  )
}

export default function Page() {
  return (
    <Suspense>
      <Share />
    </Suspense>
  )
}
