'use client'

import { createContext, useContext, useState } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { IconCheck, IconVerified } from '@/components/ui/icons'
import { Meta } from '@/components/ui/Meta'
import { plural } from '@/lib/i18n'
import type { GroundingReport } from '@/lib/schemas'
import { openingWords, readableReason } from '@/lib/ui/readable-reason'

/**
 * The verification result, worn on the sleeve. A pass is one quiet green
 * line; a failure names each unverified claim by bullet id, because "review
 * before sending" only works when you know exactly what to review. Every
 * flag now carries a one-sentence reason — the deterministic checks quote
 * the specific requirement text they matched, the same way the AI
 * distortion-check quotes the conflicting source wording — and can be
 * marked reviewed without hiding it: nothing here is ever deleted from
 * view, only struck through, because a claim you dismissed and then forgot
 * about is worse than one you keep seeing.
 */
/** The opening words of a flagged line, so you know which one to look at. */
function snippet(text: string | undefined): string | null {
  if (!text) return null
  const clean = text.replace(/\s+/g, ' ').trim()
  // Spanish quotes in both languages' chrome would be wrong for English;
  // « » reads correctly in Spanish and is unambiguous in English too.
  // Long enough to recognise the line, cut between words.
  return `«${openingWords(clean, 110)}»`
}

/**
 * True once the application is sent: the flags then describe a CV already
 * out the door, so they stop asking you to review it "before you send".
 */
export const DocumentsSent = createContext(false)

/**
 * True once the application is sent or settled: the documents are a record,
 * and the paid moves (rewrite, swap in a base CV) are no longer offered.
 */
export const DocumentsLocked = createContext(false)

const SECTIONS = ['title', 'skills', 'education', 'extras'] as const

/** The dictionary key of a section-level flag; anything else is a CV line. */
function sectionKey(id: string): (typeof SECTIONS)[number] | 'line' {
  return (SECTIONS as readonly string[]).includes(id) ? (id as (typeof SECTIONS)[number]) : 'line'
}

export function GroundingFlags({
  report,
  textOf = {},
}: {
  report: GroundingReport
  /** Bullet or paragraph id to its text. A flag names the line it is about,
   *  not an internal id like "b5" that the reader cannot see anywhere. */
  textOf?: Record<string, string>
}) {
  const t = useT()
  const sent = useContext(DocumentsSent)
  const locale = useLocale()
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())

  const hard: { id: string; key: string; text: string; quote?: string }[] = [
    ...report.uncitedBullets.map((id) => ({
      id,
      key: `uncited-${id}`,
      text: t('studio.flag.uncited'),
    })),
    ...report.invalidCitations.map((c) => ({
      id: c.bulletId,
      key: `invalid-${c.bulletId}-${c.evidenceId}`,
      text: t('studio.flag.unknownEvidence', { id: c.evidenceId }),
    })),
    ...report.unverifiedNumbers.map((n) => ({
      id: n.bulletId,
      key: `number-${n.bulletId}-${n.token}`,
      text: t('studio.flag.number', { token: n.token }),
    })),
    ...report.claimedGaps.map((g) => ({
      id: g.bulletId,
      key: `gap-${g.bulletId}-${g.keyword}`,
      text: g.requirementText
        ? t('studio.flag.claimedGapDetailed', {
            keyword: g.keyword,
            requirement: g.requirementText,
          })
        : t('studio.flag.claimedGap', { keyword: g.keyword }),
    })),
    ...(report.unsupportedClaims ?? []).map((c) => ({
      id: c.bulletId,
      key: `unsupported-${c.bulletId}-${c.text}`,
      // The claim itself is the quote: a skill or a degree, not a whole section.
      quote: c.text,
      text: t('studio.flag.unsupported', {
        section: t(`studio.section.${sectionKey(c.bulletId)}`),
      }),
    })),
    ...report.distortions.map((d) => ({
      id: d.bulletId,
      key: `distortion-${d.bulletId}`,
      text: d.reason,
    })),
  ]

  if (hard.length === 0) {
    return (
      <p className="verify-ok icon-label">
        <IconVerified />
        {t('studio.verified')}
      </p>
    )
  }

  const reviewedCount = hard.filter((f) => reviewed.has(f.key)).length

  function toggle(key: string) {
    setReviewed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div role={sent ? undefined : 'alert'} className={sent ? 'verify-card is-sent' : 'verify-card'}>
      <p className="verify-head">
        <Meta>
          {plural(t, hard.length, sent ? 'studio.unverifiedSent' : 'studio.unverified')}
          {reviewedCount > 0 && (
            <span className="verify-count">
              {t('studio.reviewedCount', { r: reviewedCount, n: hard.length })}
            </span>
          )}
        </Meta>
      </p>
      <ul className="verify-list">
        {hard.map((f) => {
          const isReviewed = reviewed.has(f.key)
          const quote = snippet(f.quote ?? textOf[f.id])
          return (
            <li key={f.key} className={isReviewed ? 'verify-row is-reviewed' : 'verify-row'}>
              <span className={quote ? 'flag-quote' : 'ident'}>
                {quote ??
                  (sectionKey(f.id) === 'line' ? f.id : t(`studio.section.${sectionKey(f.id)}`))}
              </span>
              <span className="verify-reason">
                {readableReason(f.text, locale === 'es' ? 'es' : 'en')}
              </span>
              <button
                type="button"
                className="verify-toggle icon-label"
                onClick={() => toggle(f.key)}
                aria-pressed={isReviewed}
              >
                <IconCheck />
                {t('studio.flag.reviewed')}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
