'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteRoleAction, updateRoleAction } from '@/app/(app)/evidence/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText, plural, type Translate } from '@/lib/i18n'
import type { Experience } from '@/lib/schemas'

const PERIOD = /^\d{4}-\d{2}$/

/**
 * A role's stated facts, editable in place. Facts flow verbatim into every
 * generated CV, so a typo'd company name is not cosmetic — and until now the
 * only way to fix one was a full re-import. Delete is armed behind a second
 * click that names how many evidence records go with it: interviewed records
 * die too, which is exactly why it says so.
 */
export function RoleHeader({
  role,
  recordCount,
  quantified,
  needsExpanding,
}: {
  role: Experience
  recordCount: number
  quantified: number
  needsExpanding: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(role.title)
  const [company, setCompany] = useState(role.company)
  const [start, setStart] = useState(role.period.start)
  const [end, setEnd] = useState(role.period.end ?? '')
  const [armedDelete, setArmedDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  const canSave =
    title.trim().length > 0 &&
    company.trim().length > 0 &&
    PERIOD.test(start) &&
    (end === '' || PERIOD.test(end))

  function beginEdit() {
    setTitle(role.title)
    setCompany(role.company)
    setStart(role.period.start)
    setEnd(role.period.end ?? '')
    setArmedDelete(false)
    setError(null)
    setEditing(true)
  }

  if (!editing) {
    return (
      <>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 'var(--space-5)',
            flexWrap: 'wrap',
            marginTop: 'var(--space-4)',
          }}
        >
          <h2 style={{ font: 'var(--type-h4)', color: 'var(--text-strong)' }}>
            {role.title}
            {/* Non-breaking before the interpunct: if the line wraps, the
                separator must not be the first thing on the next line. */}
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
              {' · '}
              {role.company}
            </span>
          </h2>
          <span style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'baseline' }}>
            <button type="button" className="action-quiet" onClick={beginEdit}>
              {t('role.edit')}
            </button>
            <Link
              href={`/evidence/interview/${role.id}`}
              className="action"
              style={needsExpanding ? undefined : { color: 'var(--text-muted)' }}
            >
              {t('evidence.expand')}
            </Link>
          </span>
        </div>

        <p className="fact" style={{ marginTop: 'var(--space-2)' }}>
          {role.period.start} → {role.period.end ?? t('evidence.present')}
          <span style={{ color: 'var(--text-muted)' }}>
            {'  ·  '}
            {plural(t, recordCount, 'evidence.records')}
            {'  ·  '}
            {t('evidence.quantified', { n: quantified })}
          </span>
        </p>
      </>
    )
  }

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder?: string,
  ) => (
    <div>
      <label htmlFor={id} className="fact-label" style={{ display: 'block' }}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="field"
        style={{ marginTop: 'var(--space-2)' }}
      />
    </div>
  )

  return (
    <div style={{ marginTop: 'var(--space-4)', maxWidth: '34em' }}>
      <div className="stack" style={{ gap: 'var(--space-4)' }}>
        {field(`${role.id}-title`, t('addRole.title'), title, setTitle)}
        {field(`${role.id}-company`, t('addRole.company'), company, setCompany)}
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {field(`${role.id}-start`, t('addRole.start'), start, setStart, '2024-01')}
          {field(`${role.id}-end`, t('addRole.end'), end, setEnd, t('addRole.endPlaceholder'))}
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-4)' }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-5)',
          alignItems: 'baseline',
          flexWrap: 'wrap',
        }}
      >
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
                ...(end ? { end } : {}),
              })
              if (!result.ok) {
                setError(errorText(t, result.code, result.error))
                return
              }
              setEditing(false)
              router.refresh()
            })
          }
        >
          {isSaving ? t('role.saving') : t('role.save')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
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
    <button
      type="button"
      className="action-quiet"
      onClick={onConfirm}
      disabled={disabled}
      style={{ color: 'var(--signal-error)' }}
    >
      {plural(t, recordCount, 'role.deleteConfirm')}
    </button>
  )
}
