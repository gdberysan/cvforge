'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsGroup'
import { formatUsd } from '@/lib/spend/cost'

/**
 * The free trial, as its owner watches it: open or closed, today's and the
 * month's spend against their caps, and the last week's calls, errors, new
 * trials and refusals. The trial server answers only with the owner key
 * (web/trial/proxy.ts, op=ops); the key is kept in this browser only. Not
 * linked anywhere: bookmarked by the one person who needs it.
 */
type Ops = {
  state: 'open' | 'closed'
  dailyUsd: number
  monthlyUsd: number
  month: { month: string; spentUsd: number }
  days: {
    day: string
    spentUsd: number
    calls: number
    errors: number
    starts: number
    full: number
    /** Absent from a trial server older than the funnel. */
    steps?: Record<Step, number>
  }[]
}

const STEPS = ['cv_read', 'analysed', 'cv_written', 'prepped'] as const
type Step = (typeof STEPS)[number]

const KEY = 'rumbo-owner-key'

function readKey(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export default function Page() {
  const t = useT()
  const [key, setKey] = useState('')
  const [draft, setDraft] = useState('')
  const [ops, setOps] = useState<Ops | null>(null)
  const [problem, setProblem] = useState<'refused' | 'failed' | null>(null)

  useEffect(() => setKey(readKey()), [])
  useEffect(() => {
    if (!key) return
    let live = true
    fetch(`${location.origin}/trial/ops/`, { method: 'POST', headers: { 'x-owner-key': key } })
      .then(async (res) => {
        if (!live) return
        if (res.status === 404) return setProblem('refused')
        if (!res.ok) return setProblem('failed')
        setProblem(null)
        setOps((await res.json()) as Ops)
      })
      .catch(() => live && setProblem('failed'))
    return () => {
      live = false
    }
  }, [key])

  function save(e: React.FormEvent) {
    e.preventDefault()
    try {
      localStorage.setItem(KEY, draft.trim())
    } catch {
      // Kept for this visit only.
    }
    setKey(draft.trim())
  }

  const today = ops?.days[0]
  // The week's funnel: each step counted once per trial that reached it.
  const week = ops?.days ?? []
  const started = week.reduce((n, d) => n + d.starts, 0)
  const reachedStep = (s: Step) => week.reduce((n, d) => n + (d.steps?.[s] ?? 0), 0)
  const counted = week.some((d) => d.steps && STEPS.some((s) => (d.steps?.[s] ?? 0) > 0))
  const pct = (n: number) => (started > 0 ? Math.round((n / started) * 100) : 0)
  return (
    <main id="main" tabIndex={-1} className="page">
      <div className="settings-page">
        <header className="page-head settings-head">
          <p className="eyebrow">{t('web.ops.eyebrow')}</p>
          <h1 className="settings-h1">{t('web.ops.title')}</h1>
        </header>

        {(!key || problem === 'refused') && (
          <SettingsGroup title={t('web.ops.keyTitle')} alert={problem === 'refused'}>
            <form className="lock-form" onSubmit={save}>
              <label className="intake-field">
                <span>{t('web.ops.keyLabel')}</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="field"
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
                {t('web.ops.open')}
              </button>
              {problem === 'refused' && (
                <p role="alert" className="form-error">
                  {t('web.ops.refused')}
                </p>
              )}
            </form>
          </SettingsGroup>
        )}

        {problem === 'failed' && (
          <p role="alert" className="form-error">
            {t('web.ops.failed')}
          </p>
        )}

        {ops && today && (
          <>
            <SettingsGroup title={t('web.ops.now')}>
              <SettingsRow
                label={t(ops.state === 'open' ? 'web.ops.open.state' : 'web.ops.closed.state')}
                hint={t('web.ops.todayHint', {
                  spent: formatUsd(today.spentUsd),
                  cap: formatUsd(ops.dailyUsd),
                })}
              />
              <SettingsRow
                label={t('web.ops.month', { month: ops.month.month })}
                hint={t('web.ops.monthHint', {
                  spent: formatUsd(ops.month.spentUsd),
                  cap: formatUsd(ops.monthlyUsd),
                })}
              />
              {(today.errors > 0 || today.full > 0) && (
                <SettingsRow
                  label={t('web.ops.attention')}
                  hint={t('web.ops.attentionHint', { errors: today.errors, full: today.full })}
                />
              )}
            </SettingsGroup>
            <SettingsGroup title={t('web.ops.funnel')}>
              <SettingsRow label={t('web.ops.step.starts')} hint={String(started)} />
              {counted ? (
                STEPS.map((s) => (
                  <SettingsRow
                    key={s}
                    label={t(`web.ops.step.${s}`)}
                    hint={t('web.ops.funnel.hint', { n: reachedStep(s), pct: pct(reachedStep(s)) })}
                  />
                ))
              ) : (
                <p className="settings-feedback">{t('web.ops.funnel.none')}</p>
              )}
            </SettingsGroup>
            <SettingsGroup title={t('web.ops.week')}>
              <div className="table-scroll">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('web.ops.col.day')}</th>
                      <th scope="col">{t('web.ops.col.spent')}</th>
                      <th scope="col">{t('web.ops.col.calls')}</th>
                      <th scope="col">{t('web.ops.col.starts')}</th>
                      <th scope="col">{t('web.ops.col.errors')}</th>
                      <th scope="col">{t('web.ops.col.full')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.days.map((d) => (
                      <tr key={d.day}>
                        <th scope="row">{d.day}</th>
                        <td className="num">{formatUsd(d.spentUsd)}</td>
                        <td className="num">{d.calls}</td>
                        <td className="num">{d.starts}</td>
                        <td className="num">{d.errors}</td>
                        <td className="num">{d.full}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SettingsGroup>
          </>
        )}
      </div>
    </main>
  )
}
