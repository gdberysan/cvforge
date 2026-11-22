'use client'

import { useId, useState, useTransition } from 'react'
import { saveCompanyAliasesAction } from '@/app/(app)/application/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText } from '@/lib/i18n'

/**
 * "También escribe como" (spec 2026-10-17 mail accuracy §5): the other names
 * or email domains the employer writes under, so the agent's mail pass ties
 * its replies to this application. Each add or remove saves the whole list;
 * the server normalises it and the chips show what was stored.
 */
export function CompanyAliases({
  applicationId,
  aliases: initial,
}: {
  applicationId: string
  aliases: string[]
}) {
  const t = useT()
  const fieldId = useId()
  const [aliases, setAliases] = useState<string[]>(initial)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = (next: string[], after?: () => void) => {
    setError(null)
    start(async () => {
      const out = await saveCompanyAliasesAction(applicationId, next)
      if (out.ok) {
        setAliases(out.aliases)
        after?.()
      } else {
        setError(errorText(t, out.code, t('aliases.failed')))
      }
    })
  }

  return (
    <section className="aliases" aria-labelledby={`${fieldId}-label`}>
      <p id={`${fieldId}-label`} className="fact-label">
        {t('aliases.label')}
      </p>
      {aliases.length > 0 ? (
        <ul className="chips aliases-list">
          {aliases.map((a) => (
            <li key={a}>
              <button
                type="button"
                className="chip alias-chip"
                disabled={pending}
                aria-label={t('aliases.remove', { name: a })}
                onClick={() => save(aliases.filter((x) => x !== a))}
              >
                {a}
                <span aria-hidden className="alias-chip-x">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="agent-help">{t('aliases.none')}</p>
      )}
      <form
        className="aliases-form"
        onSubmit={(e) => {
          e.preventDefault()
          const value = draft.trim()
          if (!value) return
          save([...aliases, value], () => setDraft(''))
        }}
      >
        <label htmlFor={fieldId} className="sr-only">
          {t('aliases.field')}
        </label>
        <input
          id={fieldId}
          className="field aliases-field"
          value={draft}
          maxLength={200}
          placeholder={t('aliases.field')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn-quiet" disabled={pending}>
          {t('aliases.add')}
        </button>
      </form>
      <p className="agent-help">{t('aliases.hint')}</p>
      {error && (
        <p role="alert" className="settings-feedback">
          <span className="is-error">{error}</span>
        </p>
      )}
    </section>
  )
}
