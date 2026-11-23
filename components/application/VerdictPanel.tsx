'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { Chip } from '@/components/ui/Chip'
import { IconInfo } from '@/components/ui/icons'
import { Sheet } from '@/components/ui/Sheet'
import { VERDICT_KEYS } from '@/lib/coverage'
import { plural } from '@/lib/i18n'
import type { Coverage, Requirement } from '@/lib/schemas'

/**
 * The answer this step exists for, biggest on the page: the verdict word, the
 * one sentence that justifies it, the mandatory coverage drawn to scale, and
 * any gate. A gate is never folded away — skip is a gate, not a low score.
 * The generic "what this verdict means" paragraph waits behind a tap.
 */
export function VerdictPanel({ coverage, sentence }: { coverage: Coverage; sentence: string }) {
  const t = useT()
  const [explain, setExplain] = useState(false)
  // A gate is the one thing on this page that ends the decision; its full
  // wording is a tap away, as every other requirement's is.
  const [gate, setGate] = useState<{ r: Requirement; unjudged: boolean } | null>(null)
  const copy = VERDICT_KEYS[coverage.verdict]
  const unjudged = coverage.unjudgedGates ?? []
  const segs = [
    { key: 'strong', n: coverage.mandatoryStrong },
    { key: 'partial', n: coverage.mandatoryPartial },
    { key: 'missing', n: coverage.mandatoryMissing },
  ] as const

  return (
    <section className={`verdict-panel verdict-${coverage.verdict}`} aria-labelledby="verdict-word">
      <p className="eyebrow">{t('verdict.eyebrow')}</p>
      <p id="verdict-word" className="verdict-word">
        {t(copy.label)}
      </p>
      <p className="verdict-say">{sentence}</p>

      {coverage.mandatoryTotal > 0 && (
        <>
          {/* One segment per requirement, as on the triage card: the bar is
              read left to right in the same order as its legend. */}
          <div
            className="verdict-meter"
            role="img"
            aria-label={t('coverage.aria', {
              strong: coverage.mandatoryStrong,
              total: coverage.mandatoryTotal,
            })}
          >
            {segs.flatMap((s) =>
              Array.from({ length: s.n }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by nature
                <span key={`${s.key}${i}`} className={`seg seg-${s.key}`} />
              )),
            )}
          </div>
          <ul className="verdict-legend">
            {segs
              .filter((s) => s.n > 0)
              .map((s) => (
                <li key={s.key} className={`legend-${s.key}`}>
                  <span className="num">{s.n}</span> {plural(t, s.n, `legend.${s.key}`)}
                </li>
              ))}
          </ul>
        </>
      )}

      {coverage.hardBlockers.length > 0 && (
        <div className="verdict-gates">
          {/* The sentence above already says it can't be fixed; this names it. */}
          <p className="gate-title">{t('verdict.blockerLabel')}</p>
          <ul className="chips">
            {coverage.hardBlockers.map((r) => (
              <li key={r.id}>
                <Chip
                  tone="missing"
                  toneLabel={t('verdict.blocked')}
                  onClick={() => setGate({ r, unjudged: false })}
                >
                  {r.keyword}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
      {unjudged.length > 0 && (
        <div className="verdict-gates">
          <p className="gate-title">{t('verdict.unjudged')}</p>
          <ul className="chips">
            {unjudged.map((r) => (
              <li key={r.id}>
                <Chip
                  tone="unjudged"
                  toneLabel={t('requirements.unjudged')}
                  onClick={() => setGate({ r, unjudged: true })}
                >
                  {r.keyword}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        className="action-quiet verdict-explain"
        onClick={() => setExplain(true)}
      >
        <IconInfo />
        {t('verdict.whatMeans')}
      </button>
      <Sheet open={gate !== null} onClose={() => setGate(null)} title={gate?.r.keyword ?? ''}>
        {gate && (
          <>
            <p className="fact">{t(`kind.${gate.r.kind}`)}</p>
            <blockquote className="req-asked">{gate.r.text}</blockquote>
            <p className="sheet-text">
              {gate.unjudged ? t('verdict.unjudgedOne') : t('verdict.blocked')}
            </p>
          </>
        )}
      </Sheet>
      <Sheet open={explain} onClose={() => setExplain(false)} title={t(copy.label)}>
        <p className="sheet-text">{t(copy.detail)}</p>
      </Sheet>
    </section>
  )
}
