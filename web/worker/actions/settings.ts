/**
 * The web edition's settings actions — the desktop's app/(app)/settings/
 * actions.ts is desktop-only (PDF engine, agent, mail, Mac-only guards). Same
 * names and results for what this edition keeps; the key lives in the
 * Worker's browser storage (web/lib/settings.ts).
 */
import { resetClient } from '@/lib/ai/client'
import { validateApiKey } from '@/lib/ai/validate-key'
import { clearApiKey, readSettings, writeSettings } from '@/lib/settings'
import { settingsSaved } from '@/web/lib/settings'

type Result = { ok: true } | { ok: false; error: string; code: string }

/** Check the key against Anthropic (free Models endpoint), then keep it. */
export async function saveApiKeyAction(key: string): Promise<Result> {
  const trimmed = key.trim()
  if (!trimmed) return { ok: false, error: 'Paste your key first.', code: 'key-empty' }
  const check = await validateApiKey(trimmed)
  if (!check.ok) {
    const code = check.kind === 'auth' ? 'key-invalid' : check.kind
    return { ok: false, error: `Key check failed (${check.kind}).`, code }
  }
  writeSettings({ ...readSettings(), anthropicApiKey: trimmed })
  await settingsSaved()
  resetClient()
  return { ok: true }
}

export async function clearApiKeyAction(): Promise<Result> {
  clearApiKey()
  await settingsSaved()
  resetClient()
  return { ok: true }
}
