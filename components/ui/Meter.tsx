/**
 * One bar style for every rate (craft pass): an 8 px rounded track, filled
 * to the figure. Below the honesty threshold the caller passes `muted` and
 * the track stays empty: the words beside it ("Pocos datos") say why. A
 * genuine 0 % is an empty track too, never a coloured sliver.
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
  const width = muted || pct === 0 ? 0 : Math.max(pct, 2)
  return (
    <div className="meter" aria-hidden="true">
      <div className="meter-fill" style={{ width: `${width}%`, background: color }} />
    </div>
  )
}
