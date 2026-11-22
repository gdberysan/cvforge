'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { SettingsRow } from './SettingsGroup'

type Device = { endpoint: string; label: string; lastOkAt: string | null }
type Quiet = { start: number; end: number }

const HOURS = Array.from({ length: 24 }, (_, h) => h)

async function loadDevices(): Promise<Device[] | null> {
  const res = await fetch('/api/push/subscriptions')
  return res.ok ? (await res.json()).devices : null
}

function toUint8(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * Notifications from the Mac to this device (spec 2026-10-15 §5): turn them
 * on, see every subscribed device, send a test, set quiet hours. Pushes carry
 * only a verdict word, a job title and a link — never CV content.
 */
export function PushCard() {
  const t = useT()
  const [devices, setDevices] = useState<Device[]>([])
  const [label, setLabel] = useState('S25')
  const [quiet, setQuiet] = useState<Quiet>({ start: 22, end: 8 })
  const [status, setStatus] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)

  async function refresh() {
    const next = await loadDevices()
    if (next) setDevices(next)
  }

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window)
    loadDevices()
      .then((next) => next && setDevices(next))
      .catch(() => {})
    fetch('/api/push/quiet')
      .then((r) => (r.ok ? r.json() : null))
      .then((q: Quiet | null) => q && setQuiet(q))
      .catch(() => {})
  }, [])

  async function enable() {
    setStatus(null)
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setStatus(t('push.denied'))
      const { publicKey } = await (await fetch('/api/push/key')).json()
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8(publicKey),
      })
      const res = await fetch('/api/push/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), label }),
      })
      setStatus(res.ok ? t('push.enabled') : t('push.failed'))
      await refresh()
    } catch {
      setStatus(t('push.failed'))
    }
  }

  async function remove(endpoint: string) {
    await fetch(`/api/push/subscriptions?endpoint=${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
    })
    await refresh()
  }

  async function test() {
    const res = await fetch('/api/push/test', { method: 'POST' })
    if (!res.ok) return setStatus(t('push.failed'))
    // "Sent" only when a device took it: a push service that refused every
    // device used to read as success.
    const { result } = (await res.json().catch(() => ({}))) as { result?: string }
    setStatus(
      result === 'sent'
        ? t('push.testSent')
        : result === 'no-devices'
          ? t('push.testNoDevices')
          : t('push.testFailed'),
    )
  }

  async function saveQuiet(next: Quiet) {
    setQuiet(next)
    const res = await fetch('/api/push/quiet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    })
    setStatus(res.ok ? t('push.quietSaved') : t('push.failed'))
  }

  return (
    <>
      {devices.map((d) => (
        <SettingsRow
          key={d.endpoint}
          label={
            <>
              <span className="status-dot tone-ok" aria-hidden />
              {d.label || t('push.unnamed')}
            </>
          }
        >
          <button type="button" className="action-quiet" onClick={() => remove(d.endpoint)}>
            {t('push.remove')}
          </button>
        </SettingsRow>
      ))}
      {supported ? (
        <div className="settings-row is-stacked push-enable">
          <label className="settings-row-label" htmlFor="push-device-name">
            {t('push.deviceName')}
          </label>
          <input
            id="push-device-name"
            className="field"
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="settings-row-control">
            <button type="button" className="btn btn-primary" onClick={enable}>
              {t('push.enable')}
            </button>
            {devices.length > 0 && (
              <button type="button" className="btn btn-quiet" onClick={test}>
                {t('push.test')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <SettingsRow label={t('push.unsupported')} />
      )}
      <SettingsRow label={t('push.quiet')}>
        {(['start', 'end'] as const).map((edge) => (
          <label key={edge} className="quiet-hour">
            <span className="sr-only">
              {t(edge === 'start' ? 'push.quietFrom' : 'push.quietTo')}
            </span>
            <span aria-hidden className="quiet-hour-word">
              {t(edge === 'start' ? 'push.quietFrom' : 'push.quietTo')}
            </span>
            <select
              className="flag-select"
              value={quiet[edge]}
              onChange={(e) => saveQuiet({ ...quiet, [edge]: Number(e.target.value) })}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>
              ))}
            </select>
          </label>
        ))}
      </SettingsRow>
      {status && (
        <p role="status" className="settings-feedback">
          {status}
        </p>
      )}
    </>
  )
}
