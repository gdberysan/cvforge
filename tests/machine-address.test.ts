import { describe, expect, it } from 'vitest'
import { isMachineAddress } from '@/lib/machine-address'

describe('isMachineAddress', () => {
  it('spots schedulers and no-reply senders', () => {
    for (const a of [
      'schedule@anil.greenhouse.io',
      'no-reply@x.com',
      'noreply@x.com',
      'calendar-notification@google.com',
      'notifications@lever.co',
    ])
      expect(isMachineAddress(a), a).toBe(true)
  })
  it('keeps people, even ones whose name starts like a word above', () => {
    for (const a of ['ana.schedule@x.com', 'invitado@x.com', 'nora@x.com', ''])
      expect(isMachineAddress(a), a).toBe(false)
  })
})
