/**
 * The small pictures under Números' four figures, so each number can be read
 * at a glance before its words (standard point 1). All four share one 40 px
 * band at the foot of the tile, so the tiles line up.
 */

/** Sends per week, oldest first; this week (the last bar) in ink. */
export function WeekBars({ weeks }: { weeks: number[] }) {
  const max = Math.max(1, ...weeks)
  return (
    <div className="kpi-viz week-bars" aria-hidden="true">
      {weeks.map((n, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed run of weeks
          key={i}
          className={`week-bar${i === weeks.length - 1 ? ' is-now' : ''}${n === 0 ? ' is-zero' : ''}`}
          style={{ height: n === 0 ? undefined : `${Math.max(12, (n / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

/** Each measured reply time as a dot on a 0–N day line; the median as a tick. */
export function ReplyDots({ days, median }: { days: number[]; median: number | null }) {
  if (days.length === 0) return <div className="kpi-viz" aria-hidden="true" />
  const span = Math.max(14, ...days)
  const at = (d: number) => `${(d / span) * 100}%`
  const seen = new Map<number, number>()
  return (
    <div className="kpi-viz reply-dots" aria-hidden="true">
      <span className="reply-line" />
      {median !== null && <span className="reply-median" style={{ left: at(median) }} />}
      {days.map((d, i) => {
        const stack = seen.get(d) ?? 0
        seen.set(d, stack + 1)
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: dots can share a day
            key={i}
            className="reply-dot"
            style={{ left: at(d), bottom: `${12 + stack * 10}px` }}
          />
        )
      })}
    </div>
  )
}

/**
 * One cell per application: filled where it holds (replied, or waiting too
 * long). Past 40 cells the run becomes one bar, still to scale.
 */
export function Cells({
  total,
  filled,
  tone,
  rest = 'todo',
}: {
  total: number
  filled: number
  tone: 'strong' | 'warm'
  rest?: 'todo' | 'ink'
}) {
  if (total === 0) return <div className="kpi-viz" aria-hidden="true" />
  if (total > 40) {
    return (
      <div className="kpi-viz cells-bar" aria-hidden="true">
        <span
          className={`cells-fill tone-${tone}`}
          style={{ width: `${(filled / total) * 100}%` }}
        />
      </div>
    )
  }
  return (
    <div className="kpi-viz cells" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: identical cells
          key={i}
          className={`cell ${i < filled ? `tone-${tone}` : `is-${rest}`}`}
        />
      ))}
    </div>
  )
}
