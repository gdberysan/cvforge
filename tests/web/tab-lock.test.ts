import { describe, expect, it, vi } from 'vitest'
import { claimDatabase, type LockManagerLike } from '@/web/lib/tab-lock'

/** The Web Locks rules this module relies on: ifAvailable, and steal rejecting the old holder. */
function fakeLocks(): LockManagerLike {
  let holder: { reject: (e: unknown) => void } | null = null
  return {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        if (holder && options.ifAvailable) {
          Promise.resolve(callback(null)).then(resolve, reject)
          return
        }
        if (holder && options.steal) {
          holder.reject(new DOMException('stolen', 'AbortError'))
          holder = null
        }
        holder = { reject }
        Promise.resolve(callback({ name })).then(resolve, reject)
      })
    },
  }
}

const hooks = () => ({ open: vi.fn(async () => {}), close: vi.fn(async () => {}), onLost: vi.fn() })
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('claimDatabase', () => {
  it('the first tab owns and opens the database; a second is told it is busy and opens nothing', async () => {
    const locks = fakeLocks()
    const a = hooks()
    const b = hooks()
    expect(await claimDatabase(locks, a)).toEqual({ kind: 'owner' })
    expect(await claimDatabase(locks, b)).toEqual({ kind: 'busy' })
    expect(a.open).toHaveBeenCalledOnce()
    expect(b.open).not.toHaveBeenCalled()
  })

  it('"use it here" takes over: the old owner closes, then learns it lost the database', async () => {
    const locks = fakeLocks()
    const a = hooks()
    const b = hooks()
    await claimDatabase(locks, a)
    expect(await claimDatabase(locks, b, { steal: true })).toEqual({ kind: 'owner' })
    await tick()
    expect(a.close).toHaveBeenCalledOnce()
    expect(a.onLost).toHaveBeenCalledOnce()
    expect(a.close.mock.invocationCallOrder[0]).toBeLessThan(
      a.onLost.mock.invocationCallOrder[0] ?? 0,
    )
    expect(b.open).toHaveBeenCalledOnce()
  })

  it('a browser without Web Locks is reported, not guessed at', async () => {
    const a = hooks()
    expect(await claimDatabase(undefined, a)).toEqual({ kind: 'unsupported' })
    expect(a.open).not.toHaveBeenCalled()
  })

  it('a database that fails to open rejects instead of claiming ownership', async () => {
    const a = { ...hooks(), open: vi.fn(async () => Promise.reject(new Error('no OPFS'))) }
    await expect(claimDatabase(fakeLocks(), a)).rejects.toThrow('no OPFS')
  })
})
