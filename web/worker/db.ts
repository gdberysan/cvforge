/**
 * The Worker's one database, opened only after this tab won the lock
 * (web/lib/tab-lock.ts runs on the page first). Two ways to keep it:
 *
 * - plain (the default): sqlite-wasm on the OPFS SAH pool, written in place;
 * - protected by a password: the database lives in memory while unlocked,
 *   and on disk only inside one sealed file (web/worker/vault.ts) with the
 *   settings and the key. Any change is sealed again within a second, and
 *   at once when the page is hidden.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Db } from '@/lib/db/client'
import { MIGRATIONS } from '@/lib/db/wasm/migrations.gen'
import { openWasmDb } from '@/lib/db/wasm/open'
import { ShimDatabase } from '@/lib/db/wasm/shim'
import {
  type DbPool,
  type ImportResult,
  importInto,
  judgeCandidate,
  looksLikeSqlite,
  MAIN_DB,
  recoverInterruptedImport,
} from '@/web/lib/db-file'
import {
  forgetSettings,
  readSettingsSnapshot,
  replaceSettings,
  setSettingsSink,
  settingsSaved,
  writeSettings,
} from '@/web/lib/settings'
import { newKey, open, seal, type Unlocked, VAULT_FILE, WrongPassword } from './vault'

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
type Pool = Awaited<ReturnType<Sqlite3['installOpfsSAHPoolVfs']>>

type MemoryDb = InstanceType<Sqlite3['oo1']['DB']>

let sqlite3: Sqlite3 | null = null
let pool: Pool | null = null
let live: { db: Db; shim: ShimDatabase } | null = null
/** Protected mode: the in-memory database and the key that seals it. */
let mem: MemoryDb | null = null
let vault: Unlocked | null = null
let sealedAt = -1
let settingsDirty = false
let saving: Promise<void> = Promise.resolve()
let timer: ReturnType<typeof setInterval> | null = null

export const NEWEST_KNOWN = Math.max(...MIGRATIONS.map((m) => m.folderMillis))

/** The open database; throws if the page never opened it (it always does first). */
export function db(): Db {
  if (!live) throw Object.assign(new Error('The database is not open.'), { code: 'db-closed' })
  return live.db
}

function openMain(): void {
  if (!sqlite3 || !pool) throw new Error('not initialised')
  live = openWasmDb(new pool.OpfsSAHPoolDb(MAIN_DB), sqlite3.capi)
}

/**
 * The previous owner (another tab that just lost the lock) may still be
 * releasing its file handles: retry for a few seconds before giving up.
 */
export async function openDatabase(): Promise<void> {
  if (live) return
  if (await vaultExists()) throw Object.assign(new Error('locked'), { code: 'locked' })
  sqlite3 ??= await sqlite3InitModule()
  let last: unknown
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'cvforge' })
      await recoverInterruptedImport(pool as unknown as DbPool)
      openMain()
      return
    } catch (err) {
      last = err
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw last
}

/** Another tab took over: let go of every handle (sealing first). */
export async function closeDatabase(): Promise<void> {
  if (mem) {
    await persist()
    closeMemory()
    return
  }
  live?.shim.close()
  live = null
  pool?.pauseVfs()
}

export function exportDatabase(): Uint8Array {
  if (mem) return memoryBytes()
  if (!pool) throw new Error('not initialised')
  return pool.exportFile(MAIN_DB)
}

export async function importDatabase(bytes: Uint8Array): Promise<ImportResult> {
  if (mem) return importIntoMemory(bytes)
  if (!sqlite3 || !pool) throw new Error('not initialised')
  const p = pool
  const s = sqlite3
  const result = await importInto({
    pool: p as unknown as DbPool,
    bytes,
    newestKnown: NEWEST_KNOWN,
    openShim: (name) => new ShimDatabase(new p.OpfsSAHPoolDb(name), s.capi),
    closeCurrent: () => {
      live?.shim.close()
      live = null
    },
  })
  if (result.ok) openMain()
  return result
}

/**
 * "Borrar todo de este navegador": closes the database and removes every
 * file this origin keeps in its private storage — the pool's files, the
 * settings with the key, anything else. Nothing is left to recover.
 */
export async function eraseEverything(): Promise<void> {
  closeMemory()
  live?.shim.close()
  live = null
  if (pool) await pool.removeVfs()
  pool = null
  const root = await navigator.storage.getDirectory()
  // keys() is on every OPFS directory; the DOM typings lag behind.
  const names: string[] = []
  for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys())
    names.push(name)
  for (const name of names) await root.removeEntry(name, { recursive: true })
}

// ---- Protected by a password -------------------------------------------

async function opfs(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory()
}

export async function vaultExists(): Promise<boolean> {
  try {
    await (await opfs()).getFileHandle(VAULT_FILE)
    return true
  } catch {
    return false
  }
}

async function readVault(): Promise<Uint8Array> {
  const file = await (await (await opfs()).getFileHandle(VAULT_FILE)).getFile()
  return new Uint8Array(await file.arrayBuffer())
}

/** createWritable writes to a swap file and replaces on close: all or nothing. */
async function writeVault(bytes: Uint8Array): Promise<void> {
  const handle = await (await opfs()).getFileHandle(VAULT_FILE, { create: true })
  const w = await handle.createWritable()
  await w.write(bytes as BufferSource)
  await w.close()
}

/** A desktop backup in WAL mode cannot be deserialized: mark it rollback-journal. */
function rollbackHeader(bytes: Uint8Array): Uint8Array {
  if (bytes[18] !== 2 && bytes[19] !== 2) return bytes
  const copy = bytes.slice()
  copy[18] = 1
  copy[19] = 1
  return copy
}

function deserialize(bytes: Uint8Array): MemoryDb {
  const s = sqlite3 as Sqlite3
  const data = rollbackHeader(bytes)
  const raw = new s.oo1.DB(':memory:')
  const ptr = s.wasm.allocFromTypedArray(data)
  raw.checkRc(
    s.capi.sqlite3_deserialize(
      raw.pointer as never,
      'main',
      ptr,
      data.byteLength,
      data.byteLength,
      s.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s.capi.SQLITE_DESERIALIZE_RESIZEABLE,
    ),
  )
  return raw
}

function loadIntoMemory(bytes: Uint8Array): void {
  const raw = deserialize(bytes)
  live = openWasmDb(raw, (sqlite3 as Sqlite3).capi)
  mem = raw
  sealedAt = -1
}

function memoryBytes(): Uint8Array {
  return (sqlite3 as Sqlite3).capi.sqlite3_js_db_export(mem as never)
}

function closeMemory(): void {
  if (timer) clearInterval(timer)
  timer = null
  if (mem) {
    live?.shim.close()
    live = null
  }
  mem = null
  vault = null
  setSettingsSink(null)
}

/** Seals the current database and settings, once at a time, in order. */
export function persist(): Promise<void> {
  saving = saving.then(async () => {
    if (!mem || !vault) return
    const changes = mem.changes(true)
    if (changes === sealedAt && !settingsDirty) return
    settingsDirty = false
    const sealed = await seal(vault, { settings: readSettingsSnapshot(), db: memoryBytes() })
    await writeVault(sealed)
    sealedAt = changes
  })
  return saving
}

function startSealing(): void {
  setSettingsSink(() => {
    settingsDirty = true
  })
  if (timer) clearInterval(timer)
  timer = setInterval(() => void persist(), 1000)
}

export type UnlockResult = { ok: true } | { ok: false; problem: 'wrong-password' }

/** Opens the sealed file with the password: the database into memory. */
export async function unlock(password: string): Promise<UnlockResult> {
  sqlite3 ??= await sqlite3InitModule()
  try {
    const { payload, unlocked } = await open(await readVault(), password)
    replaceSettings(payload.settings)
    loadIntoMemory(payload.db)
    vault = unlocked
    startSealing()
    return { ok: true }
  } catch (err) {
    if (err instanceof WrongPassword) return { ok: false, problem: 'wrong-password' }
    throw err
  }
}

/**
 * Turns the lock on: seals the database and settings with a new password,
 * reads the sealed file back to prove it opens, and only then deletes the
 * plain database and settings file.
 */
export async function protect(password: string): Promise<void> {
  if (mem) return changePassword(password)
  if (!sqlite3 || !pool) throw new Error('not initialised')
  await settingsSaved()
  const bytes = pool.exportFile(MAIN_DB)
  const settings = readSettingsSnapshot()
  const unlocked = await newKey(password)
  await writeVault(await seal(unlocked, { settings, db: bytes }))
  const check = await open(await readVault(), password)
  if (check.payload.db.length !== bytes.length) throw new Error('the sealed copy did not verify')
  live?.shim.close()
  live = null
  await pool.removeVfs()
  pool = null
  await removePlainSettings()
  loadIntoMemory(bytes)
  vault = unlocked
  sealedAt = mem ? (mem as MemoryDb).changes(true) : -1
  startSealing()
}

export async function changePassword(password: string): Promise<void> {
  if (!mem) throw new Error('not protected')
  vault = await newKey(password)
  settingsDirty = true
  await persist()
}

/** Turns the lock off: back to the plain pool and settings file, then the vault goes. */
export async function unprotect(): Promise<void> {
  if (!mem || !sqlite3) throw new Error('not protected')
  await persist()
  const bytes = memoryBytes()
  const settings = readSettingsSnapshot()
  closeMemory()
  pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'cvforge' })
  pool.unlink(MAIN_DB)
  await pool.importDb(MAIN_DB, rollbackHeader(bytes))
  writeSettings(settings as never)
  await settingsSaved()
  await (await opfs()).removeEntry(VAULT_FILE)
  live = openWasmDb(new pool.OpfsSAHPoolDb(MAIN_DB), sqlite3.capi)
}

/** "Bloquear ahora": seal, then forget the database and the key. */
export async function lockNow(): Promise<void> {
  await persist()
  closeMemory()
  forgetSettings()
}

export function isProtected(): boolean {
  return mem !== null
}

async function removePlainSettings(): Promise<void> {
  try {
    await (await opfs()).removeEntry('cvforge-settings.json')
  } catch {}
}

async function importIntoMemory(bytes: Uint8Array): Promise<ImportResult> {
  if (!looksLikeSqlite(bytes)) return { ok: false, problem: 'not-a-database' }
  let candidate: MemoryDb
  try {
    candidate = deserialize(bytes)
  } catch {
    return { ok: false, problem: 'not-a-database' }
  }
  const shim = new ShimDatabase(candidate, (sqlite3 as Sqlite3).capi)
  let problem: ReturnType<typeof judgeCandidate>
  try {
    problem = judgeCandidate(shim, NEWEST_KNOWN)
  } finally {
    shim.close()
  }
  if (problem) return { ok: false, problem }
  live?.shim.close()
  loadIntoMemory(bytes)
  await persist()
  return { ok: true }
}
