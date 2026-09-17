/**
 * 4px meter under a figure. Below the honesty threshold the caller passes
 * `muted` and the bar renders hatched — a texture, never a claim.
 */
export function Meter({
  pct,
  color,
  muted = false,
}: {
  pct: number
  color: string
  muted?: boolean
}) {
  return (
    <div
      style={{
        height: 4,
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-inset)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          // A genuine 0% stays an empty track — a colored sliver would be an
          // implied claim. The floor only keeps small nonzero values visible.
          width: muted ? '100%' : pct === 0 ? 0 : `${Math.max(pct, 1.5)}%`,
          background: muted
            ? 'repeating-linear-gradient(135deg, var(--graphite-600) 0 4px, transparent 4px 8px)'
            : color,
          borderRadius: 'var(--radius-pill)',
        }}
      />
    </div>
  )
}
