import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The key's second home (product spec §4.1). The environment still wins —
 * the author's `.env.local` setup is unchanged — but a buyer never has to
 * open a text file: the Settings page writes this, mode 0600, next to the
 * database.
 */
export type Settings = {
  anthropicApiKey?: string
  /** Opt-in daily check of cvforge.korven.dev/version.json. Default off. */
  updateCheck?: boolean
  /**
   * The job-agent satellite's own SQLite file (its settings and run log).
   * Personal installs only; when unset, Ajustes shows no agent card.
   */
  satelliteDbPath?: string
  /** Push quiet hours, Mac local time (lib/push/quiet.ts). Unset → 22–8. */
  pushQuietHours?: { start: number; end: number }
  /** Prepare the kit in the background when a find is chased. Unset → on. */
  kitOnChase?: boolean
  /** Background kits per local day, 1–10. Unset → 5. */
  kitDailyCap?: number
  /**
   * The web edition's free trial (web/trial): a pass that lets the app call
   * Anthropic through Rumbo's server, on Rumbo's budget, until it is used up.
   * Never set on the desktop app.
   */
  trialToken?: string
  /** The trial's budget is spent: the pass no longer counts as a key. */
  trialEnded?: boolean
}

export function settingsPath(): string {
  if (process.env.CVFORGE_CONFIG_PATH) return process.env.CVFORGE_CONFIG_PATH
  const dbPath = process.env.CVFORGE_DB_PATH ?? './data/cvforge.db'
  return path.join(/* turbopackIgnore: true */ path.dirname(dbPath), 'config.json')
}

export function readSettings(): Settings {
  const file = settingsPath()
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const { anthropicApiKey, updateCheck, satelliteDbPath } = parsed as {
      anthropicApiKey?: unknown
      updateCheck?: unknown
      satelliteDbPath?: unknown
    }
    const settings: Settings = {}
    if (typeof anthropicApiKey === 'string' && anthropicApiKey) {
      settings.anthropicApiKey = anthropicApiKey
    }
    if (typeof updateCheck === 'boolean') settings.updateCheck = updateCheck
    if (typeof satelliteDbPath === 'string' && satelliteDbPath) {
      settings.satelliteDbPath = satelliteDbPath
    }
    const quiet = (parsed as { pushQuietHours?: unknown }).pushQuietHours
    if (isQuietHours(quiet)) settings.pushQuietHours = { start: quiet.start, end: quiet.end }
    const { kitOnChase, kitDailyCap } = parsed as { kitOnChase?: unknown; kitDailyCap?: unknown }
    if (typeof kitOnChase === 'boolean') settings.kitOnChase = kitOnChase
    if (isKitCap(kitDailyCap)) settings.kitDailyCap = kitDailyCap
    return settings
  } catch {
    return {}
  }
}

export function writeSettings(next: Settings): void {
  const file = settingsPath()
  mkdirSync(path.dirname(file), { recursive: true })
  // Every writer merges over readSettings(), which reads an unparseable file
  // as {} — so saving any toggle would silently drop the key it still holds.
  // Keep the damaged file beside the new one instead of overwriting it.
  if (existsSync(file) && !parses(file)) renameSync(file, `${file}.damaged-${Date.now()}`)
  // Temp file + rename: a crash mid-write leaves the old file, never half of one.
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  chmodSync(tmp, 0o600)
  renameSync(tmp, file)
}

export const MAX_KIT_DAILY_CAP = 10

export const isKitCap = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_KIT_DAILY_CAP

/** Whether a chase also prepares the kit (spec 2026-10-15 agent stage A §6). */
export function kitOnChase(): boolean {
  return readSettings().kitOnChase ?? true
}

/** Background kits per local day. */
export function kitDailyCap(): number {
  return readSettings().kitDailyCap ?? 5
}

const isHour = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) < 24

function isQuietHours(value: unknown): value is { start: number; end: number } {
  if (!value || typeof value !== 'object') return false
  const { start, end } = value as { start?: unknown; end?: unknown }
  return isHour(start) && isHour(end)
}

function parses(file: string): boolean {
  try {
    JSON.parse(readFileSync(file, 'utf8'))
    return true
  } catch {
    return false
  }
}

export function clearApiKey(): void {
  const { anthropicApiKey: _removed, ...rest } = readSettings()
  writeSettings(rest)
}

/** Env or file. Like the old env-only hint, a false does not prove the SDK
 *  cannot resolve an OAuth profile — only construction can. */
export function hasCredentials(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      readSettings().anthropicApiKey,
  )
}
