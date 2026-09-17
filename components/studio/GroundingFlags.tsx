'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { plural } from '@/lib/i18n'
import type { GroundingReport } from '@/lib/schemas'

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
export function GroundingFlags({ report }: { report: GroundingReport }) {
  const t = useT()
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())

  const hard = [
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
    ...report.distortions.map((d) => ({
      id: d.bulletId,
      key: `distortion-${d.bulletId}`,
      text: d.reason,
    })),
  ]

  if (hard.length === 0) {
    return (
      <p className="fact-label" style={{ color: 'var(--signal-ok)' }}>
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
    <div
      role="alert"
      style={{
        border: '1px solid var(--signal-error)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
      }}
    >
      <p className="fact-label" style={{ color: 'var(--signal-error)' }}>
        {plural(t, hard.length, 'studio.unverified')}
        {reviewedCount > 0 && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            {' '}
            · {t('studio.reviewedCount', { r: reviewedCount, n: hard.length })}
          </span>
        )}
      </p>
      <ul
        style={{
          margin: 'var(--space-3) 0 0',
          paddingLeft: '1.1em',
          color: 'var(--text-body)',
          font: 'var(--type-body-sm)',
        }}
      >
        {hard.map((f) => {
          const isReviewed = reviewed.has(f.key)
          return (
            <li key={f.key} style={{ marginBottom: 'var(--space-1)' }}>
              <span
                className="ident"
                style={{ textDecoration: isReviewed ? 'line-through' : 'none' }}
              >
                {f.id}
              </span>{' '}
              <span style={{ textDecoration: isReviewed ? 'line-through' : 'none' }}>{f.text}</span>{' '}
              <button
                type="button"
                className="action"
                onClick={() => toggle(f.key)}
                aria-pressed={isReviewed}
              >
                {isReviewed ? t('studio.flag.unreview') : t('studio.flag.markReviewed')}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
