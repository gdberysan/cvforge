import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { getProfile, saveProfile } from '@/lib/db/queries/profile'
import { recordApiCall, spendSummary } from '@/lib/db/queries/spend'
import { openWasmDb } from '@/lib/db/wasm/open'

const ready = (async () => {
  const sqlite3 = await sqlite3InitModule()
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'cvforge' })
  const wasm = new pool.OpfsSAHPoolDb('/cvforge.db')
  return openWasmDb(wasm, sqlite3.capi).db
})()

self.onmessage = async (e: MessageEvent) => {
  if (typeof e.data === 'object') return
  try {
    const db = await ready
    if (e.data === 'write') {
      saveProfile(db, {
        basics: {
          fullName: 'Ana Prueba',
          headline: '',
          email: '',
          location: 'Bogotá',
          timezone: 'America/Bogota',
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
        preferences: { targetTitles: [], markets: ['co'] },
        updatedAt: new Date().toISOString(),
      } as Parameters<typeof saveProfile>[1])
      recordApiCall(db, {
        stage: 'spike',
        model: 'claude-opus-5',
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      })
    }
    const p = getProfile(db)
    self.postMessage({ ok: true, name: p?.basics.fullName ?? null, spend: spendSummary(db) })
  } catch (err) {
    const e2 = err as Record<string, unknown>
    self.postMessage({
      ok: false,
      error:
        `${String(err)} | name=${String(e2?.name)} | msg=${String(e2?.message)} | ${JSON.stringify(e2, Object.getOwnPropertyNames(e2 ?? {}))}`.slice(
          0,
          900,
        ),
    })
  }
}

// --- model call from the Worker (spike step 2) ---
import { z } from 'zod'
import { callStructured } from '@/lib/ai/client'
import { setSpendRecorder } from '@/lib/ai/spend-hook'
import { writeSettings } from '@/lib/settings'

self.addEventListener('message', async (e: MessageEvent) => {
  if (typeof e.data !== 'object' || e.data?.kind !== 'ai') return
  try {
    const db = await ready
    let last: unknown = null
    setSpendRecorder((r) => {
      last = r
      recordApiCall(db, r)
    })
    writeSettings({ anthropicApiKey: e.data.key })
    const out = await callStructured({
      schema: z.object({ greeting: z.string() }),
      system: [{ text: 'Reply with a JSON greeting.' }],
      user: 'Say hola in five words or fewer.',
      effort: 'low',
      stage: 'web-spike',
    })
    self.postMessage({ ok: true, out, spend: spendSummary(db), record: last })
  } catch (err) {
    self.postMessage({
      ok: false,
      error: String(err instanceof Error ? `${err.name}: ${err.message}` : err),
    })
  }
})
