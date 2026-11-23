'use client'

import { useState, useTransition } from 'react'
import { saveAgentSettingsAction, setKitSettingsAction } from '@/app/(app)/settings/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { Meta } from '@/components/ui/Meta'
import { Sheet } from '@/components/ui/Sheet'
import { Switch } from '@/components/ui/Switch'
import { errorText } from '@/lib/i18n'
import type { FollowedCompany } from '@/lib/satellite/companies'
import type { MailStatus } from '@/lib/satellite/mail'
import type { SavedSearch } from '@/lib/satellite/searches'
import { type AgentSettings, MAX_DAILY_CAP, VERDICT_FLOORS } from '@/lib/satellite/shared'
import type { AgentStatus } from '@/lib/satellite/status'
import { ago } from '@/lib/ui/ago'
import { AgentCompanies } from './AgentCompanies'
import { AgentMail } from './AgentMail'
import { AgentSearches } from './AgentSearches'
import { AgentSearchTitles } from './AgentSearchTitles'
import { SettingsRow } from './SettingsGroup'

/**
 * The satellite's dials, from the desk instead of the phone. Pause is the
 * off switch: the process stays alive to answer Telegram, but it scans
 * nothing, analyses nothing, sends nothing and spends nothing until resumed.
 * The two message switches turn the follow-ups and the weekly summary off
 * one at a time. The state and the off switch stay on the page; the dials
 * open in a sheet, because they are set once and rarely touched.
 */
export type KitSettings = { onChase: boolean; dailyCap: number }

const KIT_CAPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export function AgentCard({
  status,
  kit: initialKit = { onChase: true, dailyCap: 5 },
  searches,
  companies,
  mail,
  searchTitles,
  lastTick,
}: {
  status: AgentStatus
  /**
   * When the agent last analysed, already formatted on the server in the
   * reader's language and zone. Formatted here, a bare toLocaleString()
   * printed the server's US format and the browser's Mexican one, and React
   * threw a hydration error on every visit to Ajustes.
   */
  lastTick?: string
  /** The saved searches the agent scans; absent when they could not be read. */
  searches?: SavedSearch[]
  /** The followed companies; absent when the agent's table is missing or unreadable. */
  companies?: FollowedCompany[] | null
  /** The Gmail connection; absent when the agent's database could not be read. */
  mail?: MailStatus
  /** The background kit a chase starts (CVForge's config.json, not the satellite's). */
  kit?: KitSettings
  /** The titles the agent looks for and what the preview judges them on; absent outside a personal install. */
  searchTitles?: {
    titles: string[]
    profileTitles: string[]
    samples: string[]
    searchKeywords: string[]
  }
}) {
  const t = useT()
  const locale = useLocale()
  const [kit, setKit] = useState<KitSettings>(initialKit)
  const saveKit = (next: KitSettings) => {
    const before = kit
    setKit(next)
    setNote(null)
    startTransition(async () => {
      const result = await setKitSettingsAction(next)
      if (!result.ok) {
        setKit(before)
        setNote({ kind: 'error', text: errorText(t, result.code, result.error) })
      }
    })
  }
  // What is stored, and the sheet's working copy of it: closing the sheet
  // without saving returns the dials to what is stored.
  const [saved, setSaved] = useState<AgentSettings>(status.settings)
  const [form, setForm] = useState<AgentSettings>(status.settings)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (next: AgentSettings, after?: () => void) => {
    setNote(null)
    startTransition(async () => {
      const result = await saveAgentSettingsAction(next)
      if (result.ok) {
        setSaved(next)
        setForm(next)
        setNote({ kind: 'ok', text: t('settings.agent.saved') })
        after?.()
      } else {
        setNote({ kind: 'error', text: errorText(t, result.code, result.error) })
      }
    })
  }

  const num = (key: keyof AgentSettings, min: number, max: number, wide = false) => (
    <input
      id={`agent-${key}`}
      className={wide ? 'field field-mono agent-num is-wide' : 'field field-mono agent-num'}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={form[key] === null ? '' : String(form[key])}
      onChange={(e) => {
        const raw = e.target.value
        setForm({ ...form, [key]: raw === '' ? (key === 'salaryFloor' ? null : 0) : Number(raw) })
      }}
    />
  )

  const when = lastTick ?? t('settings.agent.never')

  return (
    <>
      <SettingsRow
        label={
          <>
            <span className={`status-dot ${saved.paused ? 'tone-off' : 'tone-ok'}`} aria-hidden />
            <span aria-live="polite">
              {saved.paused ? t('settings.agent.paused') : t('settings.agent.running')}
            </span>
          </>
        }
        hint={
          <>
            <span className="block">
              {t('settings.agent.cadence', { start: saved.wakeStart, end: saved.wakeEnd })}
            </span>
            {status.lastScan && (
              <span className="block">
                {t('settings.agent.lastScan', {
                  ago: ago(status.lastScan.at, locale),
                  seen: status.lastScan.seen,
                  judged: status.lastScan.judged,
                  found: status.lastScan.found,
                })}
              </span>
            )}
            <Meta>
              {t('settings.agent.lastTick', { when })}
              {t('settings.agent.triagedToday', { n: status.triagedToday, cap: saved.dailyCap })}
            </Meta>
          </>
        }
      />
      <SettingsRow label={t('settings.agent.kitOnChase')} hint={t('settings.agent.kitCost')}>
        <Switch
          checked={kit.onChase}
          onChange={(next) => saveKit({ ...kit, onChase: next })}
          label={t('settings.agent.kitOnChase')}
          disabled={pending}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.agent.kitPerDay')} htmlFor="agent-kitPerDay">
        <select
          id="agent-kitPerDay"
          className="flag-select kit-cap-select"
          value={kit.dailyCap}
          disabled={pending}
          onChange={(e) => saveKit({ ...kit, dailyCap: Number(e.target.value) })}
        >
          {KIT_CAPS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </SettingsRow>
      {searches && <AgentSearches searches={searches} />}
      {searchTitles && <AgentSearchTitles {...searchTitles} />}
      {companies !== undefined && <AgentCompanies companies={companies} />}
      {mail && <AgentMail mail={mail} />}
      <div className="settings-row">
        <p className="agent-help">{t('settings.agent.telegramBackup')}</p>
      </div>
      <div className="settings-row settings-actions">
        <button
          type="button"
          className={saved.paused ? 'btn btn-primary' : 'btn btn-quiet'}
          disabled={pending}
          onClick={() => submit({ ...saved, paused: !saved.paused })}
        >
          {saved.paused ? t('settings.agent.resume') : t('settings.agent.pause')}
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            setForm(saved)
            setNote(null)
            setOpen(true)
          }}
        >
          {t('settings.agent.adjust')}
        </button>
      </div>
      {note && !open && (
        <p role={note.kind === 'error' ? 'alert' : 'status'} className="settings-feedback">
          <span className={note.kind === 'error' ? 'is-error' : 'is-muted'}>{note.text}</span>
        </p>
      )}

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false)
          setForm(saved)
        }}
        title={t('settings.agent.adjust')}
      >
        <form
          className="agent-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit(form, () => setOpen(false))
          }}
        >
          <div className="agent-fields">
            <div>
              <label htmlFor="agent-dailyCap" className="fact-label block">
                {t('settings.agent.dailyCap')}
              </label>
              {num('dailyCap', 1, MAX_DAILY_CAP)}
            </div>
            <div>
              <label htmlFor="agent-digestSize" className="fact-label block">
                {t('settings.agent.digestSize')}
              </label>
              {num('digestSize', 1, 20)}
            </div>
          </div>
          <p className="agent-help">{t('settings.agent.dailyCap.help')}</p>

          <div className="agent-fields">
            <div>
              <label htmlFor="agent-verdictFloor" className="fact-label block">
                {t('settings.agent.verdictFloor')}
              </label>
              <select
                id="agent-verdictFloor"
                className="flag-select"
                value={form.verdictFloor}
                onChange={(e) =>
                  setForm({
                    ...form,
                    verdictFloor: e.target.value as AgentSettings['verdictFloor'],
                  })
                }
              >
                {VERDICT_FLOORS.map((v) => (
                  <option key={v} value={v}>
                    {t(`verdict.${v}.label`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="agent-salaryFloor" className="fact-label block">
                {t('settings.agent.salaryFloor')}
              </label>
              {num('salaryFloor', 0, 10_000_000, true)}
              <span className="agent-help block">{t('settings.agent.salaryFloor.help')}</span>
            </div>
          </div>

          <fieldset className="agent-fieldset">
            <legend className="fact-label">{t('settings.agent.wake')}</legend>
            <div className="agent-hours">
              <label htmlFor="agent-wakeStart" className="agent-hours-label">
                {t('settings.agent.wakeStart')}
              </label>
              {num('wakeStart', 0, 23)}
              <label htmlFor="agent-wakeEnd" className="agent-hours-label">
                {t('settings.agent.wakeEnd')}
              </label>
              {num('wakeEnd', 0, 23)}
            </div>
          </fieldset>

          <fieldset className="agent-fieldset">
            <legend className="fact-label">{t('settings.agent.messages')}</legend>
            {(['followUps', 'weeklyReport'] as const).map((key) => (
              <div key={key} className="agent-switch-row">
                <span>{t(`settings.agent.${key}`)}</span>
                <Switch
                  checked={form[key]}
                  onChange={(next) => setForm({ ...form, [key]: next })}
                  label={t(`settings.agent.${key}`)}
                />
              </div>
            ))}
          </fieldset>

          <button type="submit" className="btn btn-primary" disabled={pending}>
            {t('settings.agent.save')}
          </button>
          {note && note.kind === 'error' && (
            <p role="alert" className="settings-feedback">
              <span className="is-error">{note.text}</span>
            </p>
          )}
        </form>
      </Sheet>
    </>
  )
}
