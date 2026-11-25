'use client'

import { useEffect, useState } from 'react'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { SettingsRow } from '@/components/settings/SettingsGroup'
import { formatDay } from '@/lib/ui/format-day'
import { driveAvailable } from './drive'
import {
  connectAndSync,
  disconnect,
  driveState,
  onDrive,
  resolveConflict,
  syncNow,
} from './drive-sync'

function useDrive() {
  const [, bump] = useState(0)
  useEffect(() => onDrive(() => bump((n) => n + 1)), [])
  return driveState()
}

type Reason = 'denied' | 'busy' | 'network'
const errorKey = (reason: Reason) => `drive.error.${reason}` as const

/** Ajustes: connect, sync now, disconnect; what the state is, in one line. */
export function DriveCard() {
  const t = useT()
  const locale = useLocale()
  const d = useDrive()
  if (!driveAvailable()) return null
  const busy = d.status.kind === 'syncing'
  return (
    <SettingsRow
      label={t('drive.title')}
      hint={
        !d.connected
          ? t('drive.hint')
          : d.status.kind === 'error'
            ? t(errorKey(d.status.reason))
            : d.lastSyncAt
              ? t('drive.lastSync', {
                  day: formatDay(new Date(d.lastSyncAt).toISOString(), locale),
                })
              : t('drive.connected')
      }
    >
      {!d.connected ? (
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => void connectAndSync()}
          disabled={busy}
        >
          {t('drive.connect')}
        </button>
      ) : (
        <span className="drive-actions">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() =>
              void (d.status.kind === 'needs-tap' || d.status.kind === 'error'
                ? connectAndSync()
                : syncNow())
            }
            disabled={busy}
          >
            {busy ? t('drive.syncing') : t('drive.sync')}
          </button>
          <button
            type="button"
            className="action"
            onClick={() => void disconnect()}
            disabled={busy}
          >
            {t('drive.disconnect')}
          </button>
        </span>
      )}
    </SettingsRow>
  )
}

/**
 * The shell's line for Drive: a new session needs one tap to sync, and when
 * both this browser and the Drive copy changed, the person picks a version.
 */
export function DriveBanner() {
  const t = useT()
  const locale = useLocale()
  const d = useDrive()
  const [dismissed, setDismissed] = useState(false)
  if (!driveAvailable() || !d.connected) return null
  if (d.status.kind === 'ask') {
    return (
      <div className="job-banner is-warning drive-banner" role="alert">
        <span>{t('drive.ask', { day: formatDay(d.status.driveAt, locale) })}</span>
        <span className="drive-actions">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => void resolveConflict('here')}
          >
            {t('drive.keepHere')}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => void resolveConflict('drive')}
          >
            {t('drive.keepDrive')}
          </button>
        </span>
      </div>
    )
  }
  if (d.status.kind === 'needs-tap' && !dismissed) {
    return (
      <div className="job-banner drive-banner" role="status">
        <span>{t(d.changedSince ? 'drive.pending' : 'drive.session')}</span>
        <span className="drive-actions">
          <button type="button" className="btn btn-quiet" onClick={() => void connectAndSync()}>
            {t('drive.sync')}
          </button>
          <button type="button" className="action" onClick={() => setDismissed(true)}>
            {t('ui.close')}
          </button>
        </span>
      </div>
    )
  }
  return null
}
