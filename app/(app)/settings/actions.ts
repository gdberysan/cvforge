'use server'

import { revalidatePath } from 'next/cache'
import { resetClient } from '@/lib/ai/client'
import { validateApiKey } from '@/lib/ai/validate-key'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { macOnlyRefusal } from '@/lib/http/mac-only'
import { clearApiKey, readSettings, writeSettings } from '@/lib/settings'

type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code: string }

/** Check the key against Anthropic, then save it (product spec §4.1). */
export async function saveApiKeyAction(key: string): Promise<Result> {
  if (isDemo()) return demoBlock()
  const refused = await macOnlyRefusal()
  if (refused) return refused
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
 * Last rung of the PDF engine ladder: only offered when neither the buyer's
 * Chrome nor Edge exists. Downloads Playwright's Chromium (~150MB) into its
 * user cache, so it survives app upgrades.
 *
 * Calls playwright-core's own installer in-process rather than
 * `playwright/cli.js`: the packaged server is traced, and the CLI is not on
 * any import path, so it never shipped and the button could only fail. The
 * download child it forks (`lib/entry/oopBrowserDownload.js`) does ship.
 * Like the CLI, it also removes cached browsers no install has registered.
 */
export async function installPdfEngineAction(): Promise<Result> {
  if (isDemo()) return demoBlock()
  const { createRequire } = await import('node:module')
  try {
    const require = createRequire(import.meta.url)
    const { registry } = require('playwright-core/lib/coreBundle') as {
      registry: { installBrowsersForNpmInstall: (browsers: string[]) => Promise<unknown> }
    }
    await registry.installBrowsersForNpmInstall(['chromium'])
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
  const refused = await macOnlyRefusal()
  if (refused) return refused
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
