/**
 * One tab owns the database. The OPFS SAH-pool VFS holds exclusive handles
 * on its files, so a second tab that opened the same database would fail
 * (or, worse, race the first on a half-written page). A Web Lock decides
 * ownership before any Worker starts:
 *
 * - the first tab takes the lock and keeps it until it closes;
 * - a later tab finds it held and says so, offering "use it here";
 * - "use it here" steals the lock: the old owner is told (its lock promise
 *   rejects), closes its database cleanly, and shows that CVForge moved.
 *
 * `locks` is injectable so the rules are tested without a browser.
 */

export const DB_LOCK = 'cvforge-db'

type Lock = { name: string } | null
type LockOptions = { ifAvailable?: boolean; steal?: boolean }
export type LockManagerLike = {
  request(
    name: string,
    options: LockOptions,
    callback: (lock: Lock) => Promise<unknown>,
  ): Promise<unknown>
}

export type TabRole = { kind: 'owner' } | { kind: 'busy' } | { kind: 'unsupported' }

export type OwnerHooks = {
  /** Open the database; resolves once it is ready. Runs only while the lock is held. */
  open: () => Promise<void>
  /** Close it cleanly. Runs when another tab takes over. */
  close: () => Promise<void> | void
  /** The lock was taken by another tab after we owned it. */
  onLost: () => void
}

/**
 * Tries to become the owning tab. Resolves with the role as soon as it is
 * known; an owner keeps the lock until the page goes away or another tab
 * steals it (then `close` and `onLost` run, in that order).
 */
export function claimDatabase(
  locks: LockManagerLike | undefined,
  hooks: OwnerHooks,
  options: { steal?: boolean } = {},
): Promise<TabRole> {
  if (!locks) return Promise.resolve({ kind: 'unsupported' })
  return new Promise<TabRole>((resolveRole, rejectRole) => {
    let owned = false
    const request = options.steal
      ? locks.request(DB_LOCK, { steal: true }, held)
      : locks.request(DB_LOCK, { ifAvailable: true }, held)

    async function held(lock: Lock): Promise<unknown> {
      if (!lock) {
        resolveRole({ kind: 'busy' })
        return
      }
      try {
        await hooks.open()
      } catch (err) {
        rejectRole(err)
        return
      }
      owned = true
      resolveRole({ kind: 'owner' })
      // Held for the life of the page: this promise never settles on its own.
      return new Promise(() => {})
    }

    // A stolen lock rejects the request promise (AbortError) in the old owner.
    request.catch(async (err: unknown) => {
      if (!owned) {
        rejectRole(err)
        return
      }
      try {
        await hooks.close()
      } finally {
        hooks.onLost()
      }
    })
  })
}
