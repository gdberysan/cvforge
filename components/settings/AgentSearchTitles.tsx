'use client'

import { useMemo, useState, useTransition } from 'react'
import { saveSearchTitlesAction } from '@/app/(app)/settings/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { Sheet } from '@/components/ui/Sheet'
import { agentRelevance, isRelevantTitle } from '@/lib/agent/relevance'
import { errorText } from '@/lib/i18n'
import { SettingsRow } from './SettingsGroup'

/**
 * The titles the agent looks for (spec 2026-10-17 §6, ruling I2): the
 * agent's own setting, not the profile's target titles — CVs are untouched.
 * The agent's free title screen reads them (or, while the list is empty, the
 * profile's target titles) with the enabled searches' keywords. The preview
 * runs that same rule (agentRelevance + isRelevantTitle) over recent postings
 * as the list is edited. It shows the title check only — not the paid
 * analysis that follows it.
 */
export function AgentSearchTitles({
  titles: initial,
  profileTitles,
  samples,
  searchKeywords,
}: {
  titles: string[]
  /** The profile's target titles: what the agent falls back to while this list is empty. */
  profileTitles: string[]
  /** Recent posting titles (agent finds, its screen's drops, applications), newest first. */
  samples: string[]
  /** The enabled searches' keywords: the agent judges by these too. */
  searchKeywords: string[]
}) {
  const t = useT()
  const [saved, setSaved] = useState<string[]>(initial)
  const [list, setList] = useState<string[]>(initial)
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const relevance = useMemo(
    () => agentRelevance({ searchTitles: list, profileTitles, keywords: searchKeywords }),
    [list, profileTitles, searchKeywords],
  )

  const count =
    saved.length === 0
      ? t('settings.agent.titles.none')
      : t(saved.length === 1 ? 'settings.agent.titles.countOne' : 'settings.agent.titles.count', {
          n: saved.length,
        })

  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j] as string, next[i] as string]
    setList(next)
    setNote(null)
  }

  const add = () => {
    const value = draft.trim()
    if (!value) return
    if (!list.some((x) => x.toLowerCase() === value.toLowerCase())) setList([...list, value])
    setDraft('')
    setNote(null)
  }

  const save = () => {
    setNote(null)
    startTransition(async () => {
      const out = await saveSearchTitlesAction(list)
      if (out.ok) {
        setSaved(out.titles)
        setList(out.titles)
        setNote({ kind: 'ok', text: t('settings.agent.titles.saved') })
      } else {
        setNote({
          kind: 'error',
          text: errorText(t, out.code, t('settings.agent.titles.failed')),
        })
      }
    })
  }

  return (
    <>
      <SettingsRow label={t('settings.agent.titles')} hint={count}>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(true)}>
          {t('settings.agent.titles.edit')}
        </button>
      </SettingsRow>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false)
          setList(saved)
          setDraft('')
          setNote(null)
        }}
        title={t('settings.agent.titles')}
      >
        <div className="agent-form">
          <p className="agent-help">{t('settings.agent.titles.lede')}</p>
          <p className="agent-help">{t('settings.agent.titles.cvsUnaffected')}</p>
          {list.length > 0 && (
            <ol className="titles-list">
              {list.map((title, i) => (
                <li key={title} className="titles-item">
                  <span className="titles-item-label">{title}</span>
                  <span className="titles-item-actions">
                    <button
                      type="button"
                      className="action-quiet"
                      disabled={pending || i === 0}
                      aria-label={t('settings.agent.titles.up', { name: title })}
                      onClick={() => move(i, -1)}
                    >
                      {t('settings.agent.titles.upShort')}
                    </button>
                    <button
                      type="button"
                      className="action-quiet"
                      disabled={pending || i === list.length - 1}
                      aria-label={t('settings.agent.titles.down', { name: title })}
                      onClick={() => move(i, 1)}
                    >
                      {t('settings.agent.titles.downShort')}
                    </button>
                    <button
                      type="button"
                      className="action-quiet"
                      disabled={pending}
                      aria-label={t('settings.agent.titles.remove', { name: title })}
                      onClick={() => {
                        setList(list.filter((x) => x !== title))
                        setNote(null)
                      }}
                    >
                      {t('settings.agent.titles.removeShort')}
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}

          <form
            className="aliases-form"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <label htmlFor="target-title-new" className="sr-only">
              {t('settings.agent.titles.field')}
            </label>
            <input
              id="target-title-new"
              className="field aliases-field"
              value={draft}
              maxLength={200}
              placeholder={t('settings.agent.titles.field')}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-quiet" disabled={pending}>
              {t('settings.agent.titles.add')}
            </button>
          </form>

          <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
            {t('settings.agent.titles.save')}
          </button>
          {note && (
            <p role={note.kind === 'ok' ? 'status' : 'alert'} className="settings-feedback">
              <span className={note.kind === 'ok' ? 'is-ok' : 'is-error'}>{note.text}</span>
            </p>
          )}

          <p className="fact-label">{t('settings.agent.titles.preview')}</p>
          {samples.length === 0 ? (
            <p className="agent-help">{t('settings.agent.titles.previewEmpty')}</p>
          ) : (
            <ul className="titles-preview">
              {samples.map((title) => {
                const kept = isRelevantTitle(title, relevance)
                return (
                  <li
                    key={title}
                    className={kept ? 'titles-preview-item' : 'titles-preview-item is-dropped'}
                  >
                    <span className="titles-preview-title">{title}</span>
                    <span className="titles-preview-verdict">
                      {t(kept ? 'settings.agent.titles.kept' : 'settings.agent.titles.dropped')}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  )
}
