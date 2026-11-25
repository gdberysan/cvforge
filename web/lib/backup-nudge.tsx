'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { blockedInApp } from '@/lib/ui/in-app'
import { BACKUP_AT, saveDatabaseCopy } from './data-card'
import { driveAvailable } from './drive'
import { connectAndSync, driveState } from './drive-sync'

const SNOOZE = 'backup.snoozeUntil'
const DAY = 86_400_000

/**
 * Everything lives in this browser only: cleared site data, a new phone or
 * the laptop show an empty app. Once there is something worth keeping (an
 * application), Hoy says so once and offers the copy in one tap; Ajustes
 * keeps the full controls (export and import). Quiet for 30 days after a
 * copy, two weeks after "Ahora no".
 */
export function BackupNudge({ appCount }: { appCount: number }) {
  const t = useT()
  const [show, setShow] = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle')
  useEffect(() => {
    if (appCount < 1) return
    try {
      const now = Date.now()
      const saved = Number(localStorage.getItem(BACKUP_AT) ?? 0)
      const snoozed = Number(localStorage.getItem(SNOOZE) ?? 0)
      // Synced to Drive already: nothing to ask.
      setShow(!driveState().connected && now - saved > 30 * DAY && now > snoozed)
    } catch {
      setShow(false)
    }
  }, [appCount])
  if (!show) return null

  const later = () => {
    try {
      localStorage.setItem(SNOOZE, String(Date.now() + 14 * DAY))
    } catch {}
    setShow(false)
  }
  const save = async () => {
    if (blockedInApp()) return
    setState('busy')
    try {
      await saveDatabaseCopy()
      setState('saved')
    } catch {
      setState('failed')
    }
  }

  return (
    <section className="today-section backup-nudge" aria-labelledby="h-backup">
      <div className="today-section-head">
        <h2 id="h-backup">{t('web.backup.title')}</h2>
        {state !== 'saved' && (
          <button type="button" className="action" onClick={later}>
            {t('web.backup.later')}
          </button>
        )}
      </div>
      <div className="ways-in-card">
        <div className="way">
          <p className="way-body">
            {state === 'saved'
              ? t('web.backup.saved')
              : driveAvailable()
                ? t('web.backup.bodyDrive')
                : t('web.backup.body')}
          </p>
          {state !== 'saved' && driveAvailable() && (
            <button
              type="button"
              className="btn btn-primary way-action"
              onClick={() => {
                void connectAndSync().then(() => {
                  if (driveState().connected) setShow(false)
                })
              }}
            >
              {t('drive.connect')}
            </button>
          )}
          {state !== 'saved' && (
            <button
              type="button"
              className={driveAvailable() ? 'action' : 'btn btn-quiet way-action'}
              onClick={save}
              disabled={state === 'busy'}
            >
              {t('web.backup.save')}
            </button>
          )}
          {state === 'failed' && (
            <p role="alert" className="form-error">
              {t('web.data.exportFailed')}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
