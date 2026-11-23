import { describe, expect, it } from 'vitest'
import { markDelivered, pushReachable, pushState, saveSubscription } from '@/lib/push/store'
import { withDb } from '../agent/fixtures'

const NOW = new Date('2026-10-15T18:00:00Z')
const sub = (endpoint: string) => ({ endpoint, p256dh: 'k', auth: 'a', label: 'S25' })

describe('pushReachable', () => {
  it(
    'no devices is not reachable',
    withDb((db) => {
      expect(pushReachable(db, NOW)).toBe(false)
    }),
  )

  it(
    'a device that took a push in the last two days is reachable',
    withDb((db) => {
      saveSubscription(db, sub('https://fcm.googleapis.com/a'))
      expect(pushReachable(db, NOW)).toBe(false) // never delivered yet
      markDelivered(db, 'https://fcm.googleapis.com/a', new Date('2026-10-14T09:00:00Z'))
      expect(pushReachable(db, NOW)).toBe(true)
    }),
  )

  it(
    'only stale devices are not reachable',
    withDb((db) => {
      saveSubscription(db, sub('https://fcm.googleapis.com/a'))
      markDelivered(db, 'https://fcm.googleapis.com/a', new Date('2026-10-12T09:00:00Z'))
      expect(pushReachable(db, NOW)).toBe(false)
    }),
  )
})

/**
 * The Telegram backup says why the finds came there. "Desde hace 2 días" is
 * only true of a phone that once took a push.
 */
describe('pushState', () => {
  it(
    'tells no phone, a phone that never took a push, a quiet one, and a working one apart',
    withDb((db) => {
      expect(pushState(db, NOW)).toBe('none')
      saveSubscription(db, sub('https://fcm.googleapis.com/a'))
      expect(pushState(db, NOW)).toBe('unconfirmed')
      markDelivered(db, 'https://fcm.googleapis.com/a', new Date('2026-10-12T09:00:00Z'))
      expect(pushState(db, NOW)).toBe('stale')
      markDelivered(db, 'https://fcm.googleapis.com/a', new Date('2026-10-14T09:00:00Z'))
      expect(pushState(db, NOW)).toBe('reachable')
    }),
  )
})
