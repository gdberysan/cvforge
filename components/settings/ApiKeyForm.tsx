'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { clearApiKeyAction, saveApiKeyAction } from '@/app/(app)/settings/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconExternal } from '@/components/ui/icons'
import { errorText } from '@/lib/i18n'
import { haptic } from '@/lib/ui/haptics'
import { SettingsRow } from './SettingsGroup'

/**
 * The key, in three states: from the phone it cannot be changed (saving is
 * Mac-only), so no form is offered; with a key saved it is one row until
 * "Cambiar"; with none, the form is the point of the group.
 */
export function ApiKeyForm({
  hasSavedKey,
  envManaged,
  local,
  onSaved,
  recover,
  idleNote,
}: {
  hasSavedKey: boolean
  envManaged: boolean
  /** True on the Mac itself (the desktop app); false in the browser edition. */
  local: boolean
  /** After the server accepted the key (the journey shows its own moment). */
  onSaved?: (key: string) => void
  /** Where to get a new key: after a refusal, until the field changes, this
      (not a retry of the same refused key) is the main action. */
  recover?: { href: string; label: string }
  /** What the field's message line says while nothing is happening; checking
      and errors take the same line, so nothing below it moves. */
  idleNote?: string
}) {
  const t = useT()
  const router = useRouter()
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [changing, setChanging] = useState(false)
  const [shown, setShown] = useState(false)
  // The text that was just refused: sending it again cannot succeed.
  const [refused, setRefused] = useState<string | null>(null)
  // A value already known to be malformed: no button to send it, until it changes.
  const [malformed, setMalformed] = useState<string | null>(null)
  // One tap instead of focus, long-press and "Paste" on a phone; only where
  // the browser lets a page read the clipboard on a tap.
  const [canPaste, setCanPaste] = useState(false)
  useEffect(
    () => setCanPaste(typeof navigator !== 'undefined' && !!navigator.clipboard?.readText),
    [],
  )
  async function pasteFromClipboard() {
    try {
      const pasted = (await navigator.clipboard.readText()).trim()
      if (!pasted) return
      setKey(pasted)
      save(pasted)
    } catch {
      // Refused or unavailable: the field itself still takes a paste.
      document.getElementById('api-key')?.focus()
    }
  }

  function save(value = key) {
    setError(null)
    setStatus(null)
    // A wrong start is known here: say so before asking Anthropic.
    if (value.trim() && !value.trim().startsWith('sk-ant-')) {
      setError(t('error.key-format'))
      setMalformed(value)
      return
    }
    startTransition(async () => {
      const result = await saveApiKeyAction(value)
      if (!result.ok) {
        // A key with the right start was read whole: say what is left
        // (incomplete or revoked), not "check the start".
        setError(
          result.code === 'key-invalid' && value.trim().startsWith('sk-ant-')
            ? t('error.key-invalid-whole')
            : errorText(t, result.code, result.error),
        )
        if (result.code === 'key-invalid') setRefused(value)
        return
      }
      setKey('')
      setChanging(false)
      setStatus(`${t('settings.connected')} · ${t('settings.saved')}`)
      // The server accepted it: the one moment this form confirms.
      haptic('confirm')
      onSaved?.(value.trim())
      router.refresh()
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      await clearApiKeyAction()
      setStatus(t('settings.removed'))
      router.refresh()
    })
  }

  const keyRow = (
    <SettingsRow
      label={
        <>
          <span className={`status-dot ${hasSavedKey ? 'tone-ok' : 'tone-warn'}`} aria-hidden />
          {hasSavedKey ? t('settings.key.saved') : t('settings.key.none')}
        </>
      }
      hint={envManaged ? t('settings.envManaged') : undefined}
    >
      {local && hasSavedKey && !changing && (
        <>
          <button type="button" className="btn btn-quiet" onClick={() => setChanging(true)}>
            {t('settings.key.change')}
          </button>
          <button type="button" className="action-quiet" onClick={remove} disabled={isPending}>
            {t('settings.key.remove')}
          </button>
        </>
      )}
    </SettingsRow>
  )

  // A refusal is said under the field (in the form); this line only
  // confirms, or reports an error where there is no form.
  const formShown = local && (!hasSavedKey || changing)
  const feedback = (status || (error && !formShown)) && (
    <p aria-live="polite" className="settings-feedback">
      {status && <span className="is-ok">{status}</span>}
      {error && !formShown && (
        <span role="alert" className="is-error">
          {error}
        </span>
      )}
    </p>
  )

  if (!local) {
    return (
      <>
        {keyRow}
        <SettingsRow label={t('settings.key.fromMac')} />
      </>
    )
  }

  return (
    <>
      {/* With no key the group's own title already says so. */}
      {hasSavedKey && keyRow}
      {(!hasSavedKey || changing) && (
        <form
          className="settings-row is-stacked settings-form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="settings-row-label" htmlFor="api-key">
            {t('settings.keyLabel')}
          </label>
          <span className={`key-field${isPending ? ' is-checking' : ''}`}>
            <input
              id="api-key"
              className="field field-mono"
              type={shown ? 'text' : 'password'}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'api-key-error' : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder={t('settings.keyPlaceholder')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              // Paste and done: what looks like a whole key is checked and
              // saved at once (a typed one waits for the button).
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text').trim()
                if (/^sk-ant-[\w-]{20,}$/.test(pasted)) {
                  e.preventDefault()
                  setKey(pasted)
                  save(pasted)
                }
              }}
            />
            {isPending && <span className="key-field-spinner" aria-hidden="true" />}
            <button
              type="button"
              className="key-field-toggle"
              aria-pressed={shown}
              aria-controls="api-key"
              onClick={() => setShown((v) => !v)}
            >
              {shown ? t('settings.key.hide') : t('settings.key.show')}
            </button>
          </span>
          {canPaste && !key && !isPending && (
            <button type="button" className="btn btn-quiet key-paste" onClick={pasteFromClipboard}>
              {t('settings.key.paste')}
            </button>
          )}
          {/* What happens to the key is said under the field itself:
              checking, or why it was refused. */}
          {(isPending || error || idleNote) && (
            <p className="settings-feedback key-field-note" aria-live="polite">
              {isPending ? (
                <span className="is-pending">{t('settings.saving')}</span>
              ) : error ? (
                <span role="alert" id="api-key-error" className="is-error">
                  {error}
                </span>
              ) : (
                idleNote
              )}
            </p>
          )}
          <div className="settings-row-control">
            {malformed !== null && malformed === key ? null : recover &&
              refused !== null &&
              refused === key &&
              !isPending ? (
              <a
                className="btn btn-primary icon-label"
                href={recover.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {recover.label}
                <IconExternal />
              </a>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isPending || key.trim().length === 0}
              >
                {isPending ? t('settings.saving') : t('settings.save')}
              </button>
            )}
            {changing && (
              <button type="button" className="btn btn-quiet" onClick={() => setChanging(false)}>
                {t('addRole.cancel')}
              </button>
            )}
          </div>
        </form>
      )}
      {feedback}
    </>
  )
}
