'use client'

import { useId } from 'react'

/** Equal-width choices, no "All": every option is a real filter. Real radios underneath. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const name = useId()
  return (
    <fieldset className="segmented">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label key={o.value} className={o.value === value ? 'is-on' : undefined}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}
