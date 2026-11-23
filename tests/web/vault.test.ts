import { describe, expect, it } from 'vitest'
import { isVault, newKey, open, seal, WrongPassword } from '@/web/worker/vault'

// Few iterations: the format is what is under test, not PBKDF2's cost.
const FAST = 1000
const db = new Uint8Array([83, 81, 76, 105, 116, 101, 0, 1, 2, 3, 250])
const settings = { anthropicApiKey: 'sk-ant-not-real', kitDailyCap: 5 }

describe('the password vault', () => {
  it('opens with the password it was sealed with, giving back settings and database', async () => {
    const sealed = await seal(await newKey('una contraseña larga', FAST), { settings, db })
    expect(isVault(sealed)).toBe(true)
    const { payload } = await open(sealed, 'una contraseña larga')
    expect(payload.settings).toEqual(settings)
    expect(Array.from(payload.db)).toEqual(Array.from(db))
  })

  it('never contains the key or the database in the clear', async () => {
    const sealed = await seal(await newKey('pw', FAST), { settings, db })
    const text = new TextDecoder('latin1').decode(sealed)
    expect(text).not.toContain('sk-ant')
    expect(text).not.toContain('SQLite')
  })

  it('refuses a wrong password, and a vault with one byte changed', async () => {
    const sealed = await seal(await newKey('right', FAST), { settings, db })
    await expect(open(sealed, 'wrong')).rejects.toBeInstanceOf(WrongPassword)
    const tampered = sealed.slice()
    tampered[tampered.length - 1] ^= 1
    await expect(open(tampered, 'right')).rejects.toBeInstanceOf(WrongPassword)
  })

  it('saves again under the same password with a fresh IV each time', async () => {
    const first = await open(await seal(await newKey('pw', FAST), { settings, db }), 'pw')
    const a = await seal(first.unlocked, { settings, db })
    const b = await seal(first.unlocked, { settings, db })
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
    expect((await open(b, 'pw')).payload.settings).toEqual(settings)
  })

  it('uses 600,000 PBKDF2 iterations unless told otherwise', async () => {
    const { iterations } = await newKey('pw')
    expect(iterations).toBe(600_000)
  })
})
