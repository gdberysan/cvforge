/**
 * A document being made, drawn in the shape of the one being written: a CV
 * (name, sections, bullets), a letter (greeting, paragraphs), screening
 * answers (question, answer) or a message (bubbles). What it does follows
 * the real stage, never a timer: while the model writes, lines write
 * themselves in; while the code checks the draft against the record, a scan
 * passes and lines are ticked; while a flagged line is reworked, that line
 * rewrites. With reduced motion every state still shows, held still.
 *
 * Drawn as SVG so every size is an attribute, not an inline style; the
 * colours and the motion live in app/globals.css (.build-*).
 */
export type BuildKind = 'cv' | 'coverLetter' | 'screening' | 'recruiterMessage'
export type BuildPhase = 'writing' | 'checking' | 'fixing'

type RowKind = 'name' | 'sub' | 'head' | 'line' | 'bullet' | 'q' | 'bubble' | 'gap'
/** Each row: its kind and how much of the column it fills, in percent. */
type Row = [RowKind, number]

const SHAPES: Record<BuildKind, Row[]> = {
  cv: [
    ['name', 58],
    ['sub', 40],
    ['gap', 0],
    ['head', 30],
    ['line', 92],
    ['line', 74],
    ['head', 36],
    ['bullet', 88],
    ['bullet', 80],
    ['bullet', 66],
    ['head', 28],
    ['bullet', 74],
  ],
  coverLetter: [
    ['sub', 34],
    ['gap', 0],
    ['head', 44],
    ['line', 94],
    ['line', 90],
    ['line', 62],
    ['gap', 0],
    ['line', 92],
    ['line', 86],
    ['line', 48],
    ['gap', 0],
    ['sub', 30],
  ],
  screening: [
    ['q', 70],
    ['line', 92],
    ['line', 66],
    ['gap', 0],
    ['q', 58],
    ['line', 88],
    ['line', 74],
    ['gap', 0],
    ['q', 64],
    ['line', 80],
  ],
  recruiterMessage: [
    ['bubble', 78],
    ['bubble', 64],
    ['gap', 0],
    ['bubble', 86],
    ['bubble', 52],
  ],
}

const W = 132
const H = 176
const LEFT = 14
const COLUMN = W - LEFT - 22
const GAP = 6
const HEIGHT: Record<RowKind, number> = {
  name: 10,
  sub: 4,
  head: 6,
  line: 5,
  bullet: 5,
  q: 6,
  bubble: 24,
  gap: 3,
}

export function BuildSheet({ kind, phase }: { kind: BuildKind; phase: BuildPhase }) {
  const rows = SHAPES[kind]
  // The line a "fixing" pass reworks: the first body line after the header.
  const fixAt = rows.findIndex(([k], i) => i > 2 && (k === 'line' || k === 'bullet'))
  let y = 16
  let order = 0
  let bubbles = 0
  const drawn = rows.map(([k, w], i) => {
    const top = y + (k === 'head' ? 3 : 0)
    y = top + HEIGHT[k] + GAP
    if (k === 'gap') return null
    const indent = k === 'bullet' ? 8 : 0
    const width = ((COLUMN - indent) * w) / 100
    const right = k === 'bubble' && bubbles++ % 2 === 1
    const x = right ? LEFT + COLUMN - width : LEFT + indent
    const h = HEIGHT[k]
    const body = k === 'line' || k === 'bullet'
    return (
      <g
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed drawing; rows never move
        key={i}
        className={`build-row is-${k} d${order++}${i === fixAt ? ' is-fix' : ''}`}
      >
        {k === 'bullet' && <circle className="build-dot" cx={LEFT + 2} cy={top + h / 2} r={2} />}
        <rect
          className="build-ink"
          x={x}
          y={top}
          width={width}
          height={h}
          rx={k === 'bubble' ? 12 : h / 2}
        />
        {body && <circle className="build-tick" cx={x + width + 9} cy={top + h / 2} r={4} />}
      </g>
    )
  })
  return (
    <div className={`build-sheet is-${kind} is-${phase}`} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id="build-scan-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="build-scan-stop" stopOpacity="0" />
            <stop offset="0.5" className="build-scan-stop" stopOpacity="0.2" />
            <stop offset="1" className="build-scan-stop" stopOpacity="0" />
          </linearGradient>
        </defs>
        {drawn}
        <rect
          className="build-scan"
          x="0"
          y="0"
          width={W}
          height="34"
          fill="url(#build-scan-fill)"
        />
      </svg>
    </div>
  )
}

/** The phase a compose stage shows as. */
export function phaseOf(stage: string | null): BuildPhase {
  if (stage === 'repairing' || stage === 'refining') return 'fixing'
  if (stage === 'checking' || stage === 'verifying' || stage === 'rechecking') return 'checking'
  return 'writing'
}
