import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Db } from '@/lib/db/client'
import { getProfile, saveProfile } from '@/lib/db/queries/profile'
import { MIGRATIONS } from '@/lib/db/wasm/migrations.gen'
import { openWasmDb } from '@/lib/db/wasm/open'
import { ShimDatabase } from '@/lib/db/wasm/shim'
import { importInto, MAIN_DB, recoverInterruptedImport } from '@/web/lib/db-file'

let db: Db | null = null
let shim: ShimDatabase | null = null
// biome-ignore lint/suspicious/noExplicitAny: spike
let pool: any = null
// biome-ignore lint/suspicious/noExplicitAny: spike
let sqlite: any = null

/** The old owner may still be releasing its handles: retry for a few seconds. */
async function open(): Promise<void> {
  const sqlite3 = await sqlite3InitModule()
  sqlite = sqlite3
  let last: unknown
  for (let i = 0; i < 40; i++) {
    try {
      const p = await sqlite3.installOpfsSAHPoolVfs({ name: 'cvforge' })
      pool = p
      await recoverInterruptedImport(p)
      const opened = openWasmDb(new p.OpfsSAHPoolDb(MAIN_DB), sqlite3.capi)
      db = opened.db
      shim = opened.shim
      return
    } catch (err) {
      last = err
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw last
}

self.onmessage = async (e: MessageEvent) => {
  const { id, op, name } = e.data as { id: number; op: string; name?: string }
  try {
    let result: unknown = null
    if (op === 'open') await open()
    if (op === 'close') {
      shim?.close()
      pool?.pauseVfs()
      db = null
    }
    if (op === 'save' && db) {
      saveProfile(db, {
        basics: {
          fullName: name ?? '',
          headline: '',
          email: '',
          location: '',
          timezone: 'UTC',
          links: [],
        },
        summary: '',
        experience: [],
        education: [],
        skills: [],
        languages: [],
        certifications: [],
        projects: [],
        workAuthorization: [],
        preferences: { targetTitles: [], markets: [] },
        updatedAt: new Date().toISOString(),
      } as Parameters<typeof saveProfile>[1])
    }
    if (op === 'read') result = db ? (getProfile(db)?.basics.fullName ?? null) : 'NO-DB'
    if (op === 'persist') result = await navigator.storage.persist()
    const live = shim
    if (op === 'counts' && live) {
      const n = (t: string) =>
        (live.prepare(`select count(*) as n from ${t}`).get() as { n: number }).n
      result = {
        applications: n('applications'),
        evidence: n('evidence_items'),
        apiCalls: n('api_calls'),
        files: pool.getFileNames(),
      }
    }
    if (op === 'export') result = pool.exportFile(MAIN_DB)
    if (op === 'import') {
      const bytes = (e.data as { bytes: Uint8Array }).bytes
      const newestKnown = Math.max(...MIGRATIONS.map((m) => m.folderMillis))
      result = await importInto({
        pool,
        bytes,
        newestKnown,
        openShim: (n) => new ShimDatabase(new pool.OpfsSAHPoolDb(n), sqlite.capi),
        closeCurrent: () => shim?.close(),
      })
      if ((result as { ok: boolean }).ok) {
        const opened = openWasmDb(new pool.OpfsSAHPoolDb(MAIN_DB), sqlite.capi)
        db = opened.db
        shim = opened.shim
      }
    }
    self.postMessage({ id, ok: true, result })
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) })
  }
}
