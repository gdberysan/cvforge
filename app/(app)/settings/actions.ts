'use server'

import { revalidatePath } from 'next/cache'
import { resetClient } from '@/lib/ai/client'
import { validateApiKey } from '@/lib/ai/validate-key'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { clearApiKey, readSettings, writeSettings } from '@/lib/settings'

type Result = { ok: true } | { ok: false; error: string; code: string }

/** Check the key against Anthropic, then save it (product spec §4.1). */
export async function saveApiKeyAction(key: string): Promise<Result> {
  if (isDemo()) return demoBlock()
  const trimmed = key.trim()
  if (!trimmed) return { ok: false, error: 'Paste your key first.', code: 'key-empty' }

  const check = await validateApiKey(trimmed)
  if (!check.ok) {
    const code = check.kind === 'auth' ? 'key-invalid' : check.kind
    return { ok: false, error: `Key check failed (${check.kind}).`, code }
  }

  // Merge, never replace: the key save must not drop the other settings.
  writeSettings({ ...readSettings(), anthropicApiKey: trimmed })
  resetClient()
  revalidatePath('/')
  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Last rung of the PDF engine ladder: only offered when neither the user's
 * Chrome nor Edge exists. Downloads Playwright's Chromium (~150MB) into its
 * user cache, so it survives app upgrades.
 */
export async function installPdfEngineAction(): Promise<Result> {
  if (isDemo()) return demoBlock()
  const { execFile } = await import('node:child_process')
  const { createRequire } = await import('node:module')
  const path = await import('node:path')
  try {
    const require = createRequire(import.meta.url)
    const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js')
    await new Promise<void>((resolve, reject) => {
      execFile(
        process.execPath,
        [cli, 'install', 'chromium'],
        { timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 },
        (err) => (err ? reject(err) : resolve()),
      )
    })
    const { resetEngineProbe } = await import('@/lib/render/pdf')
    resetEngineProbe()
    revalidatePath('/settings')
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'install failed',
      code: 'pdf-install-failed',
    }
  }
}

export async function clearApiKeyAction(): Promise<Result> {
  if (isDemo()) return demoBlock()
  clearApiKey()
  resetClient()
  revalidatePath('/')
  revalidatePath('/settings')
  return { ok: true }
}

/** The opt-in update notice (LEEME discloses exactly what it fetches). */
export async function setUpdateCheckAction(enabled: boolean): Promise<Result> {
  if (isDemo()) return demoBlock()
  writeSettings({ ...readSettings(), updateCheck: enabled })
  revalidatePath('/')
  revalidatePath('/settings')
  return { ok: true }
}
