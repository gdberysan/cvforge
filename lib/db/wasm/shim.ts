import type { BindingSpec, CAPI, Database, PreparedStatement } from '@sqlite.org/sqlite-wasm'

/**
 * The slice of better-sqlite3 that drizzle's better-sqlite3 driver and the
 * app's raw callers use, implemented over SQLite compiled to WebAssembly.
 *
 * Why a shim rather than a different drizzle driver: the app's 58 query
 * functions and 25 transactions are synchronous, written against
 * `BetterSQLite3Database`. sqlite-wasm's oo1 API is synchronous too (inside a
 * Worker, on the OPFS SAH-pool VFS), so presenting it as better-sqlite3 keeps
 * every query, transaction and type unchanged. An async driver
 * (sqlite-proxy) would have meant rewriting all of them and new interleaving
 * bugs between awaits.
 *
 * Each call prepares, runs and finalizes its own statement: drizzle never
 * finalizes what it prepares (better-sqlite3 leaves that to the GC), and an
 * unfinalized wasm statement leaks native memory.
 */

export type WasmDb = Database
export type WasmCapi = Pick<CAPI, 'sqlite3_changes' | 'sqlite3_last_insert_rowid'>
type WasmStmt = PreparedStatement

export type RunResult = { changes: number; lastInsertRowid: number | bigint }

type Row = Record<string, unknown>

/** better-sqlite3 binds booleans as 1/0 and has no undefined; wasm must match. */
function bindable(params: unknown[]): BindingSpec {
  return params.map((p) =>
    p === true ? 1 : p === false ? 0 : p === undefined ? null : p,
  ) as BindingSpec
}

/** Row ids fit a JS number; better-sqlite3 returns a number unless safeIntegers. */
function asNumber(v: bigint | number): number | bigint {
  if (typeof v === 'bigint' && v <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(v)
  return v
}

export class ShimStatement {
  private rawMode = false
  constructor(
    private readonly db: WasmDb,
    private readonly capi: WasmCapi,
    readonly source: string,
  ) {}

  private withStmt<T>(params: unknown[], fn: (s: WasmStmt) => T): T {
    const s = this.db.prepare(this.source)
    try {
      if (params.length > 0) s.bind(bindable(params))
      return fn(s)
    } finally {
      s.finalize()
    }
  }

  /** better-sqlite3: toggles array rows for this statement and returns it. */
  raw(toggle = true): ShimStatement {
    const view = new ShimStatement(this.db, this.capi, this.source)
    view.rawMode = toggle
    return view
  }

  run(...params: unknown[]): RunResult {
    this.withStmt(params, (s) => {
      while (s.step()) {
        // drain: a RETURNING clause or a pragma may yield rows
      }
    })
    return {
      changes: this.capi.sqlite3_changes(this.db),
      lastInsertRowid: asNumber(this.capi.sqlite3_last_insert_rowid(this.db)),
    }
  }

  get(...params: unknown[]): Row | unknown[] | undefined {
    return this.withStmt(params, (s) => {
      if (!s.step()) return undefined
      return this.rawMode ? s.get([]) : s.get({})
    })
  }

  all(...params: unknown[]): (Row | unknown[])[] {
    return this.withStmt(params, (s) => {
      const out: (Row | unknown[])[] = []
      while (s.step()) out.push(this.rawMode ? s.get([]) : s.get({}))
      return out
    })
  }
}

type TxFn<A extends unknown[], R> = ((...args: A) => R) & {
  deferred: (...args: A) => R
  immediate: (...args: A) => R
  exclusive: (...args: A) => R
}

/** A better-sqlite3-shaped handle over one open wasm database. */
export class ShimDatabase {
  private depth = 0
  open = true

  constructor(
    readonly wasm: WasmDb,
    private readonly capi: WasmCapi,
  ) {}

  prepare(sql: string): ShimStatement {
    return new ShimStatement(this.wasm, this.capi, sql)
  }

  exec(sql: string): this {
    this.wasm.exec(sql)
    return this
  }

  /**
   * `pragma('foreign_keys = ON')`, or `pragma('user_version', { simple: true })`
   * for a single value, as better-sqlite3 answers them.
   */
  pragma(source: string, options: { simple?: boolean } = {}): unknown {
    const rows = this.prepare(`PRAGMA ${source}`).all() as Row[]
    if (!options.simple) return rows
    const first = rows[0]
    return first ? Object.values(first)[0] : undefined
  }

  /**
   * better-sqlite3's transaction(): a function that runs `fn` inside
   * BEGIN…COMMIT, rolling back on throw; nested calls use savepoints.
   */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): TxFn<A, R> {
    const wrap =
      (begin: string) =>
      (...args: A): R => {
        const nested = this.depth > 0
        const sp = `shim_sp${this.depth}`
        this.wasm.exec(nested ? `SAVEPOINT ${sp}` : begin)
        this.depth++
        try {
          const result = fn(...args)
          this.depth--
          this.wasm.exec(nested ? `RELEASE ${sp}` : 'COMMIT')
          return result
        } catch (err) {
          this.depth--
          this.wasm.exec(nested ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK')
          throw err
        }
      }
    const tx = wrap('BEGIN') as TxFn<A, R>
    tx.deferred = wrap('BEGIN DEFERRED')
    tx.immediate = wrap('BEGIN IMMEDIATE')
    tx.exclusive = wrap('BEGIN EXCLUSIVE')
    return tx
  }

  close(): void {
    if (!this.open) return
    this.open = false
    this.wasm.close()
  }
}
