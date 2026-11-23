import Link from 'next/link'
import { VERDICT_KEYS } from '@/lib/coverage'
import type { Translate } from '@/lib/i18n'
import type { Coverage } from '@/lib/schemas'

/**
 * The answer, kept in sight. Once an application moves on (a CV made, sent,
 * an interview), the next thing to do leads the page and the full verdict
 * moves down; this band is the verdict then (the word, its reason, the bar)
 * under the title, and the panel below keeps only the details.
 */
export function VerdictBand({
  coverage,
  sentence,
  href,
  t,
}: {
  coverage: Coverage
  /** The one sentence that justifies the verdict. */
  sentence: string
  href: string
  t: Translate
}) {
  const segs = [
    { key: 'strong', n: coverage.mandatoryStrong },
    { key: 'partial', n: coverage.mandatoryPartial },
    { key: 'missing', n: coverage.mandatoryMissing },
  ] as const
  return (
    <div className={`verdict-band verdict-${coverage.verdict}`}>
      <p className="verdict-band-word">{t(VERDICT_KEYS[coverage.verdict].label)}</p>
      <div className="verdict-band-bar">
        <p className="verdict-band-say">{sentence}</p>
        {coverage.mandatoryTotal > 0 && (
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
        )}
      </div>
      <Link href={href} className="action verdict-band-link">
        {t('verdictBand.see')}
      </Link>
    </div>
  )
}
