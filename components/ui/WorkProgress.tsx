'use client'

/**
 * The wait for a model call, made visible: a document being read (a beam
 * passes over it, its lines fill in as stages finish), the real stages by
 * name (done, in progress, next), and a bar that jumps when a stage really
 * ends and creeps slowly while one runs, never reaching the end early.
 * Every stage shown is one the server actually reports; nothing is
 * decorative timing. With reduced motion the same states show, still.
 */
export function WorkProgress({
  steps,
  current,
  title,
  note,
}: {
  /** The stages, in order, as short labels. */
  steps: string[]
  /** The stage running now (0-based); before the first report, 0. */
  current: number
  /** The sentence for what is happening now. */
  title: string
  /** A calm line under the steps (how long it usually takes). */
  note?: string
}) {
  const at = Math.max(0, Math.min(current, steps.length - 1))
  // The sheet's lines: the share already read fills in, stage by stage.
  const lines = 7
  const read = Math.round((at / steps.length) * lines)
  return (
    <div className="work" role="status" aria-live="polite">
      <div className="work-sheet" aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative lines
            key={i}
            className={`work-line${i < read ? ' is-read' : ''}${i === 0 ? ' is-head' : ''}`}
          />
        ))}
        <span className="work-beam" />
      </div>
      <div className="work-body">
        {/* Stage strings are written mid-sentence ("leyendo…"); here they head the block. */}
        <p className="work-title">{title.charAt(0).toUpperCase() + title.slice(1)}</p>
        <ol className="work-steps">
          {steps.map((s, i) => (
            <li key={s} className={i < at ? 'is-done' : i === at ? 'is-now' : 'is-next'}>
              <span className="work-mark" aria-hidden />
              <span>{s}</span>
            </li>
          ))}
        </ol>
        {/* One segment per real stage: done ones full, the running one creeping. */}
        <div className="work-bar" aria-hidden>
          {steps.map((s, i) => (
            <span key={s} className={`work-seg${i < at ? ' is-done' : ''}`}>
              {i === at && <span key={at} className="work-seg-creep" />}
            </span>
          ))}
        </div>
        {note && <p className="work-note">{note}</p>}
      </div>
    </div>
  )
}
