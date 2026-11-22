/** A 0–100 series as one SVG path; a null is a gap in the line, never a zero. */
export function sparkPath(values: (number | null)[], w: number, h: number): string {
  if (values.length === 0) return ''
  const step = values.length > 1 ? w / (values.length - 1) : 0
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) {
      pen = false
      return
    }
    const x = +(i * step).toFixed(2)
    const y = +(h - 2 - (Math.max(0, Math.min(100, v)) / 100) * (h - 4)).toFixed(2)
    d += `${pen ? 'L' : 'M'}${x} ${y} `
    pen = true
  })
  return d.trim()
}

export function Sparkline({ values }: { values: (number | null)[] }) {
  const d = sparkPath(values, 100, 40)
  if (!d) return null
  return (
    <svg className="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
