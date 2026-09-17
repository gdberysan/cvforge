'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { VERDICT_KEYS } from '@/lib/coverage'
import type { GapDelta as Delta } from '@/lib/gaps/delta'

/**
 * The payoff screen, and the place this feature's honesty either holds or does
 * not. A partial move reads as partial, a move backwards is shown, and no
 * change says so plainly — a view that only ever rendered good news would
 * teach the user to keep typing until it did, which is exactly the pressure
 * gap-fill exists to avoid applying.
 */
export function GapDelta({ delta }: { delta: Delta }) {
  const t = useT()

  return (
    <section style={{ marginTop: 'var(--space-7)' }}>
      <p className="eyebrow">{t('gaps.deltaTitle')}</p>

      {delta.moves.length === 0 && !delta.verdictChanged ? (
        <p style={{ color: 'var(--text-body)', marginTop: 'var(--space-3)' }}>
          {t('gaps.deltaNone')}
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 'var(--space-4) 0 0',
            display: 'grid',
            gap: 'var(--space-2)',
          }}
        >
          {delta.moves.map((move) => (
            <li key={move.requirementId} className="fact">
              <span style={{ color: 'var(--text-strong)' }}>{move.keyword}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {'  '}
                {t(`strengthOf.${move.before}`)} → {t(`strengthOf.${move.after}`)}
              </span>
            </li>
          ))}
          <li className="fact">
            <span style={{ color: 'var(--text-strong)' }}>{t('gaps.verdictRow')}</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {'  '}
              {delta.verdictChanged
                ? `${t(VERDICT_KEYS[delta.verdictBefore].label)} → ${t(VERDICT_KEYS[delta.verdictAfter].label)}`
                : t('gaps.verdictUnchanged')}
            </span>
          </li>
        </ul>
      )}
    </section>
  )
}
