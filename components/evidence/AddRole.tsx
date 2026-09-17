'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { addRoleAction } from '@/app/(app)/evidence/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'

const PERIOD = /^\d{4}-\d{2}$/

/**
 * The door manual entry was promised: a CV is a snapshot, and the newest role
 * is exactly what an imported PDF lacks. Entering the two facts only the user
 * can type lands them straight in the role's interview, so a manual role gets
 * the same grounding discipline as an imported one.
 */
export function AddRole() {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  const canSubmit =
    title.trim().length > 0 &&
    company.trim().length > 0 &&
    PERIOD.test(start) &&
    (end === '' || PERIOD.test(end))

  async function save(): Promise<{ roleId: string } | null> {
    const result = await addRoleAction({ title, company, start, ...(end ? { end } : {}) })
    if (!result.ok) {
      setError(errorText(t, result.code, result.error))
      return null
    }
    return result
  }

  if (!open) {
    return (
      <p style={{ marginTop: 'var(--space-8)' }}>
        <button type="button" className="action" onClick={() => setOpen(true)}>
          {t('evidence.addRole')}
        </button>
      </p>
    )
  }

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder: string,
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
    <section style={{ marginTop: 'var(--space-8)', maxWidth: '34em' }}>
      <hr className="rule" />
      <p className="eyebrow" style={{ marginTop: 'var(--space-4)' }}>
        {t('addRole.eyebrow')}
      </p>
      <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
        {field('role-title', t('addRole.title'), title, setTitle, t('addRole.titlePlaceholder'))}
        {field(
          'role-company',
          t('addRole.company'),
          company,
          setCompany,
          t('addRole.companyPlaceholder'),
        )}
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {field('role-start', t('addRole.start'), start, setStart, '2024-01')}
          {field('role-end', t('addRole.end'), end, setEnd, t('addRole.endPlaceholder'))}
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-4)' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSubmit || isSaving}
          onClick={() =>
            startSave(async () => {
              const result = await save()
              if (!result) return
              // Straight into the interview: the role exists, now recover
              // what it did — the same path every imported role takes.
              router.push(`/evidence/interview/${result.roleId}`)
            })
          }
        >
          {isSaving ? t('addRole.saving') : t('addRole.submit')}
        </button>
        {/* The interview is optional: the role your CV missed must be
            addable without committing to questions right now. Its section
            keeps the amber "expand" nudge until the interview happens. */}
        <button
          type="button"
          className="btn btn-quiet"
          disabled={!canSubmit || isSaving}
          onClick={() =>
            startSave(async () => {
              if (!(await save())) return
              setOpen(false)
              setTitle('')
              setCompany('')
              setStart('')
              setEnd('')
              router.refresh()
            })
          }
        >
          {t('addRole.submitOnly')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
          {t('addRole.cancel')}
        </button>
      </div>
    </section>
  )
}
