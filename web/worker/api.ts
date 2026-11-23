/**
 * Everything the page may ask the Worker. This grows into the web edition's
 * counterpart of the desktop's server actions and API routes: same names,
 * same results, the same lib/ code underneath.
 */
import { resetClient } from '@/lib/ai/client'
import { setPaidCallLedger } from '@/lib/ai/in-flight'
import { setSpendRecorder } from '@/lib/ai/spend-hook'
import { type Screenshot, transcribePosting } from '@/lib/ai/stages/transcribe-posting'
import { getProfile } from '@/lib/db/queries/profile'
import {
  closePaidCall,
  openPaidCall,
  recordApiCall,
  settleInterruptedCalls,
  spendSummary,
} from '@/lib/db/queries/spend'
import { readSettings, writeSettings } from '@/lib/settings'
import { forgetSettings, loadSettings, settingsSaved } from '@/web/lib/settings'
import { action, route } from './bridge'
import {
  changePassword,
  closeDatabase,
  db,
  eraseEverything,
  exportDatabase,
  importDatabase,
  isProtected,
  lockNow,
  openDatabase,
  persist,
  protect,
  unlock,
  unprotect,
  vaultExists,
} from './db'
import { load } from './loaders'
import { setWorkerLocale } from './shims/i18n-server'

// Every model call lands one spend row, in this Worker's database; and is
// on record while in flight, so one the page does not survive is not lost.
setSpendRecorder((record) => recordApiCall(db(), record))
setPaidCallLedger({
  open: (call) => openPaidCall(db(), call),
  close: (id) => closePaidCall(db(), id),
})

export const api = {
  /**
   * Opens the database and settles any paid call the last page did not live
   * to see answered (an unknown cost, never a silent one). Returns how many.
   */
  open: async (): Promise<{ locked: boolean; interrupted: number }> => {
    // Protected by a password: nothing opens until it is typed.
    if (await vaultExists()) return { locked: true, interrupted: 0 }
    await loadSettings()
    await openDatabase()
    return { locked: false, interrupted: settleInterruptedCalls(db()) }
  },
  /** The password lock: open, turn on, change, turn off, lock now. */
  unlock: async (password: string) => {
    const result = await unlock(password)
    return result.ok ? { ok: true as const, interrupted: settleInterruptedCalls(db()) } : result
  },
  protect: (password: string) => protect(password),
  changePassword: (password: string) => changePassword(password),
  unprotect: () => unprotect(),
  lockNow: () => lockNow(),
  isProtected: () => isProtected(),
  /** The page is being hidden: seal now rather than within the second. */
  flush: () => persist(),
  close: closeDatabase,
  /** Everything this browser holds for CVForge, gone: data, key, settings. */
  erase: async () => {
    await settingsSaved()
    forgetSettings()
    await eraseEverything()
  },
  exportDatabase,
  importDatabase,
  action,
  route,
  load,
  /** Screenshots of a posting -> its text (one paid call, recorded like any other). */
  transcribeScreenshots: (shots: Screenshot[]) => transcribePosting(shots),
  setLocale: setWorkerLocale,

  /** What the home screen needs to decide where to send a person. */
  status: () => {
    const profile = getProfile(db())
    return {
      hasProfile: profile !== null,
      name: profile?.basics.fullName ?? null,
      hasKey: Boolean(readSettings().anthropicApiKey),
      spend: spendSummary(db()),
    }
  },

  /**
   * Starts the free trial (web/trial): asks Rumbo's trial server for a pass
   * and keeps it like a key. `closed`: no trial right now (switched off or the
   * month's budget is spent); `limit`: too many trials from this network today.
   */
  startTrial: async (): Promise<'started' | 'closed' | 'limit' | 'failed'> => {
    try {
      const res = await fetch(`${self.location.origin}/trial/start/`, { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { state?: string; token?: string }
      if (res.ok && body.state === 'started' && body.token) {
        writeSettings({ ...readSettings(), trialToken: body.token, trialEnded: false })
        await settingsSaved()
        resetClient()
        return 'started'
      }
      return body.state === 'limit' ? 'limit' : body.state === 'closed' ? 'closed' : 'failed'
    } catch {
      return 'failed'
    }
  },

  setApiKey: async (key: string) => {
    writeSettings({ ...readSettings(), anthropicApiKey: key.trim() })
    await settingsSaved()
  },
}

export type WorkerApi = typeof api
