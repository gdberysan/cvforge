'use client'

import { useState } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { IconFind } from '@/components/ui/icons'
import { Sheet } from '@/components/ui/Sheet'
import { formatDay } from '@/lib/ui/format-day'
import { postingBlocks } from '@/lib/ui/posting-blocks'

/**
 * The posting as it was analysed, one tap from every step: weeks later it is
 * the one thing the page cannot rebuild, and the live listing may be gone.
 */
export function PostingSheet({
  postingRaw,
  postingUrl,
  analysedAt,
}: {
  postingRaw: string
  postingUrl: string | null
  analysedAt: string
}) {
  const t = useT()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const day = formatDay(analysedAt, locale)
  return (
    <>
      <button type="button" className="action icon-label" onClick={() => setOpen(true)}>
        <IconFind />
        {t('application.viewPosting')}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('application.postingTitle')}>
        <p className="posting-meta">
          {t('application.analysedOn', { date: day })}
          {postingUrl && (
            <>
              {' · '}
              {/* A third-party link the person pasted: no referrer. */}
              <a href={postingUrl} target="_blank" rel="noreferrer noopener" className="action">
                {t('application.openListing')}
              </a>
            </>
          )}
        </p>
        {/* Headings, lists and paragraphs as the posting wrote them: every
            word kept, read as a page rather than a text dump. */}
        <div className="posting-text">
          {postingBlocks(postingRaw).map((b, i) =>
            b.kind === 'heading' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no id
              <h3 key={i}>{b.text}</h3>
            ) : b.kind === 'list' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no id
              <ul key={i}>
                {b.items.map((item, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: items have no id
                  <li key={j}>{item}</li>
                ))}
              </ul>
            ) : (
              // Its lines stay lines: a title over a company is not one sentence.
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no id
              <p key={i}>
                {b.lines.map((line, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines have no id
                  <span key={j} className="posting-line">
                    {line}
                  </span>
                ))}
              </p>
            ),
          )}
        </div>
      </Sheet>
    </>
  )
}
