'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { normalizeSearchTitles } from '@/lib/agent/search-titles'
import { resetClient } from '@/lib/ai/client'
import { validateApiKey } from '@/lib/ai/validate-key'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { macOnlyRefusal } from '@/lib/http/mac-only'
import { parseBoardUrl, probeBoard, type Site } from '@/lib/satellite/board-probe'
import {
  addCompany,
  deleteCompany,
  type FollowedCompany,
  readCompanies,
  setCompanyEnabled,
} from '@/lib/satellite/companies'
import { type MailSwitchKey, requestGmailDisconnect, setMailSwitch } from '@/lib/satellite/mail'
import { writeSearchTitles } from '@/lib/satellite/search-titles'
import { addSearch, deleteSearch, setSearchEnabled } from '@/lib/satellite/searches'
import { isAgentAvailable, writeAgentSettings } from '@/lib/satellite/settings'
import { clearApiKey, isKitCap, readSettings, satelliteDbPath, writeSettings } from '@/lib/settings'

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

const AgentInput = z.object({
  dailyCap: z.number().int(),
  digestSize: z.number().int(),
  verdictFloor: z.enum(['stretch', 'worth-it', 'strong']),
  salaryFloor: z.number().int().nullable(),
  wakeStart: z.number().int(),
  wakeEnd: z.number().int(),
  paused: z.boolean(),
  followUps: z.boolean(),
  weeklyReport: z.boolean(),
})

/**
 * Writes the job-agent satellite's settings in place. The satellite reads
 * them at the start of every tick, so nothing needs restarting and there
 * is no Telegram round trip. Range rules mirror the satellite's own.
 */
export async function saveAgentSettingsAction(input: unknown): Promise<Result> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) {
    return { ok: false, error: 'Agent database not found.', code: 'agent-unavailable' }
  }
  const parsed = AgentInput.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Invalid agent settings.', code: 'agent-invalid' }
  }
  const result = writeAgentSettings(file, parsed.data)
  if (!result.ok) return { ok: false, error: 'Rejected by validation.', code: result.code }
  revalidatePath('/settings')
  return { ok: true }
}

/**
 * The background kit a chase starts (spec 2026-10-15 agent stage A §6):
 * on or off, and how many a day. Allowed from the phone — it is spend the
 * user is choosing, not the key.
 */
export async function setKitSettingsAction(input: {
  onChase: boolean
  dailyCap: number
}): Promise<Result> {
  if (isDemo()) return demoBlock()
  if (typeof input?.onChase !== 'boolean' || !isKitCap(input.dailyCap)) {
    return { ok: false, error: 'Invalid kit settings.', code: 'invalid-request' }
  }
  writeSettings({ ...readSettings(), kitOnChase: input.onChase, kitDailyCap: input.dailyCap })
  revalidatePath('/settings')
  return { ok: true }
}

const SearchInput = z.object({
  label: z.string(),
  keywords: z.string(),
  location: z.string(),
  remote: z.boolean(),
})

const agentUnavailable = {
  ok: false as const,
  error: 'Agent database not found.',
  code: 'agent-unavailable',
}

/**
 * The agent's saved searches (spec 2026-10-15 Telegram alerts only): what
 * /buscar did in Telegram. The agent reads them at the start of every scan.
 * Allowed from the phone, like the agent's other dials.
 */
export async function addSearchAction(input: unknown): Promise<Result> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return agentUnavailable
  const parsed = SearchInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid search.', code: 'search-invalid' }
  const out = addSearch(file, parsed.data)
  if (!out.ok) return { ok: false, error: 'Search refused.', code: out.code }
  revalidatePath('/settings')
  return { ok: true }
}

export async function toggleSearchAction(id: string, enabled: boolean): Promise<Result> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return agentUnavailable
  const out = setSearchEnabled(file, String(id), enabled === true)
  if (!out.ok) return { ok: false, error: 'Search not found.', code: out.code }
  revalidatePath('/settings')
  return { ok: true }
}

export async function deleteSearchAction(id: string): Promise<Result> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return agentUnavailable
  const out = deleteSearch(file, String(id))
  if (!out.ok) return { ok: false, error: 'Search not found.', code: out.code }
  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Companies the agent follows (spec 2026-10-16 agent stage B): paste a
 * careers URL or type a name and the probe finds the job site. The agent
 * reads them at the start of its next scan.
 */
export async function addCompanyAction(input: {
  nameOrUrl: string
}): Promise<Result<{ company: FollowedCompany }>> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return agentUnavailable
  const raw = typeof input?.nameOrUrl === 'string' ? input.nameOrUrl.trim() : ''
  if (!raw) return { ok: false, error: 'Invalid company.', code: 'company-invalid' }
  // The agent has not been restarted on a build that makes the table: say so before any probing.
  let existing: ReturnType<typeof readCompanies>
  try {
    existing = readCompanies(file)
  } catch {
    // Locked past the busy timeout, or not a database at all: nothing to add to.
    return agentUnavailable
  }
  if (existing === null) {
    return { ok: false, error: 'Agent not updated.', code: 'agent-outdated' }
  }
  const schemeless = !/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/\s/.test(raw)
  let found: { site: Site; board: string } | null =
    parseBoardUrl(raw) ?? (schemeless ? parseBoardUrl(`https://${raw}`) : null)
  let name: string
  if (found) {
    name = found.board.charAt(0).toUpperCase() + found.board.slice(1)
  } else if (/^https?:\/\//i.test(raw)) {
    return { ok: false, error: 'Unknown job site.', code: 'company-url-unknown' }
  } else {
    found = await probeBoard(raw)
    name = raw
  }
  if (!found) return { ok: false, error: 'No job board found.', code: 'company-not-found' }
  const out = addCompany(file, { name, ...found })
  if (!out.ok) return { ok: false, error: 'Company refused.', code: out.code }
  revalidatePath('/settings')
  return { ok: true, company: out.company }
}

export async function toggleCompanyAction(id: string, enabled: boolean): Promise<Result> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return agentUnavailable
  const out = setCompanyEnabled(file, String(id), enabled === true)
  if (!out.ok) return { ok: false, error: 'Company not found.', code: out.code }
  revalidatePath('/settings')
  return { ok: true }
}

export async function deleteCompanyAction(id: string): Promise<Result> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return agentUnavailable
  const out = deleteCompany(file, String(id))
  if (!out.ok) return { ok: false, error: 'Company not found.', code: out.code }
  revalidatePath('/settings')
  return { ok: true }
}

const MAIL_SWITCHES: readonly MailSwitchKey[] = ['mailAlerts', 'mailOutcomes', 'mailDrafts']

/** One of the three Correo switches, written at once; the agent reads it on its next tick. */
export async function setMailSwitchAction(key: string, on: boolean): Promise<Result> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) {
    return { ok: false, error: 'Agent database not found.', code: 'agent-unavailable' }
  }
  if (!(MAIL_SWITCHES as readonly string[]).includes(key) || typeof on !== 'boolean') {
    return { ok: false, error: 'Invalid switch.', code: 'invalid-request' }
  }
  try {
    setMailSwitch(file, key as MailSwitchKey, on)
  } catch {
    // An agent that has not been restarted on a build with the settings table.
    return { ok: false, error: 'Agent database not found.', code: 'agent-unavailable' }
  }
  revalidatePath('/settings')
  return { ok: true }
}

/** Desconectar: asks the agent to delete the token on its next tick (<= 15 min). */
export async function disconnectGmailAction(): Promise<Result> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) {
    return { ok: false, error: 'Agent database not found.', code: 'agent-unavailable' }
  }
  try {
    requestGmailDisconnect(file)
  } catch {
    return { ok: false, error: 'Agent database not found.', code: 'agent-unavailable' }
  }
  revalidatePath('/settings')
  return { ok: true }
}

/**
 * The titles the agent looks for (spec 2026-10-17 §6, ruling I2): the
 * agent's own `searchTitles` setting, read from its next scan. The profile's
 * target titles — and so the CVs and every evidence hash — are untouched.
 * Allowed from the phone, like the agent's other dials.
 */
export async function saveSearchTitlesAction(
  titles: unknown,
): Promise<Result<{ titles: string[] }>> {
  if (isDemo()) return demoBlock()
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return agentUnavailable
  const normal = normalizeSearchTitles(titles)
  if (!normal.ok) return { ok: false, error: 'Invalid titles.', code: normal.code }
  try {
    writeSearchTitles(file, normal.titles)
  } catch {
    return agentUnavailable
  }
  revalidatePath('/settings')
  return { ok: true, titles: normal.titles }
}
