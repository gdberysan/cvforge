/** The score as a ring: a whole circle is 100. */
export function StrengthRing({ score }: { score: number }) {
  const C = 2 * Math.PI * 17
  const filled = (Math.max(0, Math.min(100, score)) / 100) * C
  return (
    // Green when it is in good shape, amber while it needs work, red when
    // there is little to go on: the colour says how it stands.
    <svg
      className={`strength-ring tone-${score >= 80 ? 'strong' : score >= 50 ? 'partial' : 'missing'}`}
      viewBox="0 0 40 40"
      width="56"
      height="56"
      aria-hidden="true"
    >
      <circle className="strength-ring-track" cx="20" cy="20" r="17" />
      <circle
        className="strength-ring-value"
        cx="20"
        cy="20"
        r="17"
        strokeDasharray={`${filled} ${C}`}
        transform="rotate(-90 20 20)"
      />
    </svg>
  )
}
