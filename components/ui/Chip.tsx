import type { ReactNode } from 'react'
// One declaration of the tones, in the shared rule.
import type { Tone } from '@/lib/requirement-tone'

/**
 * A fact you can tap. The tone shows as a bar on the leading edge AND is
 * spoken in the accessible name — colour is never the only carrier.
 */
export function Chip({
  tone,
  toneLabel,
  onClick,
  children,
}: {
  tone: Tone
  toneLabel?: string
  onClick?: () => void
  children: ReactNode
}) {
  const inner = (
    <>
      <span className="fact-chip-text">{children}</span>
      {toneLabel && <span className="sr-only">, {toneLabel}</span>}
    </>
  )
  return onClick ? (
    <button type="button" className={`fact-chip tone-${tone}`} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <span className={`fact-chip tone-${tone}`}>{inner}</span>
  )
}
