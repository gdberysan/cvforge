'use client'

import { type TextareaHTMLAttributes, useEffect, useRef } from 'react'

/**
 * A textarea that grows to fit what it holds.
 *
 * An inner scrollbar hides the end of your own sentence, and a drag handle is
 * furniture you have to operate before you can read. Neither belongs in a
 * surface whose whole job is to hold something you wrote.
 *
 * The height is re-measured when the box changes *width*, not only when the
 * text changes: a narrower window rewraps the same sentence onto more lines,
 * and without this the field kept whatever height it was first measured at and
 * left a hole under the text. Width only — reacting to height would be
 * reacting to this component's own output.
 */
export function AutoTextarea({
  value,
  minRows = 1,
  ...props
}: { value: string; minRows?: number } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const lastWidth = useRef(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` is not read in the body, but scrollHeight changes with it — re-measuring on text change is the dependency's whole point
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      if (width === lastWidth.current) return
      lastWidth.current = width
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      {...props}
      style={{ resize: 'none', overflow: 'hidden', ...props.style }}
    />
  )
}
