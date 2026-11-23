'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import type { MessageKey } from '@/lib/i18n'
import type { Requirement } from '@/lib/schemas'

/**
 * The gating requirements that end or cloud the decision: blockers (found
 * unmet — tailoring cannot fix them) and unjudged gates (the analysis never
 * answered them, so the person checks them before applying). One component
 * so the triage console and the application page cannot word them apart.
 */
export function GateList({
  requirements,
  tone,
  style,
}: {
  requirements: Requirement[]
  tone: 'blocked' | 'unjudged'
  style?: React.CSSProperties
}) {
  const t = useT()
  if (requirements.length === 0) return null
  const color = tone === 'blocked' ? 'var(--signal-error)' : 'var(--tone-partial)'
  const heading: MessageKey = tone === 'blocked' ? 'verdict.blocked' : 'verdict.unjudged'

  return (
    <div
      style={{
        border: `1px solid ${color}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        ...style,
      }}
    >
      <p className="fact-label" style={{ color }}>
        {t(heading)}
      </p>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 'var(--space-3) 0 0',
          display: 'grid',
          gap: 'var(--space-2)',
        }}
      >
        {requirements.map((b) => (
          <li key={b.id} style={{ color: 'var(--text-body)', font: 'var(--type-body-sm)' }}>
            <span className="fact-label" style={{ marginRight: 'var(--space-2)' }}>
              {t(`kind.${b.kind}`)}
            </span>
            {b.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
