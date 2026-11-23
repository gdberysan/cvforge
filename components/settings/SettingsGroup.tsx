import { type ReactNode, useId } from 'react'

/**
 * One group of Ajustes (spec 2026-10-15 phase 4 §7): a title, one line on
 * what it is for, then rows — the same anatomy everywhere, so the page reads
 * as designed rather than accumulated.
 */
export function SettingsGroup({
  title,
  lede,
  children,
  id,
  alert = false,
}: {
  title: string
  lede?: string
  children: ReactNode
  id?: string
  /** Something blocks the app until it is done here: amber, and read first. */
  alert?: boolean
}) {
  const titleId = useId()
  return (
    <section
      className={alert ? 'settings-group is-alert' : 'settings-group'}
      aria-labelledby={titleId}
      id={id}
    >
      <h2 id={titleId} className="settings-title">
        {title}
      </h2>
      {lede && <p className="settings-lede">{lede}</p>}
      <div className="settings-rows">{children}</div>
    </section>
  )
}

/** Label (and a hint) on the left, the control on the right; stacked on a narrow phone. */
export function SettingsRow({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode
  hint?: ReactNode
  children?: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        {htmlFor ? (
          <label className="settings-row-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="settings-row-label">{label}</span>
        )}
        {hint && <span className="settings-row-hint">{hint}</span>}
      </div>
      {children && <div className="settings-row-control">{children}</div>}
    </div>
  )
}
