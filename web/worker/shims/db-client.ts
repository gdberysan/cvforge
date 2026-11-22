// lib/db/client inside the Worker: the same `db` every query takes, backed
// by the Worker's sqlite-wasm database instead of better-sqlite3 on disk.
import type { Db } from '../../../lib/db/client'
import { db as current } from '../db'

export type { Db }

export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = current() as unknown as Record<string | symbol, unknown>
    const value = real[prop]
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export function restoreDatabase(): never {
  throw Object.assign(new Error('Restore in the browser goes through Import.'), {
    code: 'not-in-browser',
  })
}
