import { Children, type CSSProperties, type ReactNode } from 'react'

/**
 * A line of facts separated by "·" — market · language · status. Each fact
 * is its own segment and the separator hangs off the END of the segment
 * before it (globals.css .meta-item::after), so a narrow screen may break
 * after a "·" but never before one: no line ever starts with a stray dot.
 * Empty items are dropped, so there is never a dangling separator either.
 */
export function Meta({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const items = Children.toArray(children).filter((c) => c !== '')
  return (
    <span className={className ? `meta ${className}` : 'meta'} style={style}>
      {items.map((item) => (
        <span key={(item as { key?: string }).key ?? String(item)} className="meta-item">
          {item}
        </span>
      ))}
    </span>
  )
}
