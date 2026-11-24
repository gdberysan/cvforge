'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteRoleAction, updateRoleAction } from '@/app/(app)/evidence/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconChevron } from '@/components/ui/icons'
import { Meta } from '@/components/ui/Meta'
import { MonthField } from '@/components/ui/MonthField'
import { errorText, plural, type Translate } from '@/lib/i18n'
import { periodLabel } from '@/lib/period'
import type { Experience } from '@/lib/schemas'

const PERIOD = /^\d{4}-\d{2}$/

/**
 * A job as one line of the page's index: the title (the button that opens
 * it), the company, when, and how much is there — plus, when some results
 * still lack a number, how many. Tapping anywhere on the line opens the job;
 * everything you can do with it sits at the foot of the opened card.
 */
export function RoleHeader({
  role,
  recordCount,
  missingNumbers,
  open,
  bodyId,
  onToggle,
}: {
  role: Experience
  recordCount: number
  missingNumbers: number
  open: boolean
  bodyId: string
  /** Absent while a filter shows every matching job open. */
  onToggle?: () => void
}) {
  const t = useT()
  return (
    <div className="role-card">
      <div className="role-card-main">
        <h3 className="role-card-title">
          <button
            type="button"
            className="role-open"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={onToggle}
            disabled={!onToggle}
          >
            {role.title}
            {role.company.trim() && <span className="sr-only">, {role.company}</span>}
          </button>
        </h3>
        {/* Where, when, how much: one line, the company first and darker. */}
        <p className="role-card-facts">
          <Meta>
            {role.company.trim() && <span className="role-card-company">{role.company}</span>}
            {periodLabel(
              role.period.start,
              role.period.end,
              t('intl.locale'),
              t('evidence.present'),
              role.period,
            )}
            {plural(t, recordCount, 'evidence.entries')}
          </Meta>
          {missingNumbers > 0 && (
            <span className="tag tone-attn">
              {t('evidence.missingNumbers', { n: missingNumbers })}
            </span>
          )}
        </p>
      </div>
      <span className="role-chevron" aria-hidden>
        <IconChevron />
      </span>
    </div>
  )
}

/**
 * A job's stated facts, edited in place. Facts flow verbatim into every
 * generated CV, so a typo'd company name is not cosmetic. Delete is armed
 * behind a second click that names how many entries go with it.
 */
export function RoleForm({
  role,
  recordCount,
  onDone,
}: {
  role: Experience
  recordCount: number
  onDone: () => void
}) {
  const t = useT()
  const router = useRouter()
  const [title, setTitle] = useState(role.title)
  const [company, setCompany] = useState(role.company)
  const [start, setStart] = useState(role.period.start)
  const [end, setEnd] = useState(role.period.end ?? '')
  // No end month means the job is still going.
  const [ongoing, setOngoing] = useState(!role.period.end)
  const [armedDelete, setArmedDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  const canSave =
    title.trim().length > 0 &&
    company.trim().length > 0 &&
    PERIOD.test(start) &&
    (ongoing || (PERIOD.test(end) && end >= start))

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder?: string,
  ) => (
    <div>
      <label htmlFor={id} className="fact-label block">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="field field-gap"
      />
    </div>
  )

  return (
    <div className="role-form">
      <div className="role-form-fields">
        {field(`${role.id}-title`, t('addRole.title'), title, setTitle)}
        {field(`${role.id}-company`, t('addRole.company'), company, setCompany)}
        <MonthField
          id={`${role.id}-start`}
          label={t('addRole.start')}
          value={start}
          onChange={setStart}
        />
        <MonthField
          id={`${role.id}-end`}
          label={t('addRole.end')}
          value={end}
          onChange={setEnd}
          current={{ label: t('addRole.current'), on: ongoing, onToggle: setOngoing }}
        />
      </div>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <div className="role-form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSave || isSaving}
          onClick={() =>
            startSave(async () => {
              const result = await updateRoleAction(role.id, {
                title,
                company,
                start,
                ...(!ongoing && end ? { end } : {}),
              })
              if (!result.ok) {
                setError(errorText(t, result.code, result.error))
                return
              }
              onDone()
              router.refresh()
            })
          }
        >
          {isSaving ? t('role.saving') : t('role.save')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          {t('addRole.cancel')}
        </button>
        <DeleteRole
          t={t}
          armed={armedDelete}
          recordCount={recordCount}
          onArm={() => setArmedDelete(true)}
          disabled={isSaving}
          onConfirm={() =>
            startSave(async () => {
              const result = await deleteRoleAction(role.id)
              if (!result.ok) {
                setError(errorText(t, result.code, result.error))
                return
              }
              router.refresh()
            })
          }
        />
      </div>
    </div>
  )
}

function DeleteRole({
  t,
  armed,
  recordCount,
  disabled,
  onArm,
  onConfirm,
}: {
  t: Translate
  armed: boolean
  recordCount: number
  disabled: boolean
  onArm: () => void
  onConfirm: () => void
}) {
  if (!armed) {
    return (
      <button type="button" className="action-quiet" onClick={onArm} disabled={disabled}>
        {t('role.delete')}
      </button>
    )
  }
  return (
    <button type="button" className="action-quiet is-error" onClick={onConfirm} disabled={disabled}>
      {plural(t, recordCount, 'role.deleteConfirm')}
    </button>
  )
}
