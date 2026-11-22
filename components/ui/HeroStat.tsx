import { Sparkline } from './Sparkline'

/** One figure leads; the line under it says what it counts, in words. */
export function HeroStat({
  value,
  label,
  series,
  delta,
}: {
  value: string
  label: string
  series?: (number | null)[]
  delta?: string | null
}) {
  return (
    <div className="hero-stat">
      <span className="hero-value num">{value}</span>
      {series && <Sparkline values={series} />}
      {delta && <span className="hero-delta num">{delta}</span>}
      <span className="hero-label">{label}</span>
    </div>
  )
}
