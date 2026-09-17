import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The key's second home (product spec §4.1). The environment still wins —
 * the author's `.env.local` setup is unchanged — but a user never has to
 * open a text file: the Settings page writes this, mode 0600, next to the
 * database.
 */
export type Settings = {
  anthropicApiKey?: string
  /** Opt-in daily check of cvforge.korven.dev/version.json. Default off. */
  updateCheck?: boolean
}

export function settingsPath(): string {
  if (process.env.CVFORGE_CONFIG_PATH) return process.env.CVFORGE_CONFIG_PATH
  const dbPath = process.env.CVFORGE_DB_PATH ?? './data/cvforge.db'
  return path.join(path.dirname(dbPath), 'config.json')
}

export function readSettings(): Settings {
  const file = settingsPath()
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const { anthropicApiKey, updateCheck } = parsed as {
      anthropicApiKey?: unknown
      updateCheck?: unknown
    }
    const settings: Settings = {}
    if (typeof anthropicApiKey === 'string' && anthropicApiKey) {
      settings.anthropicApiKey = anthropicApiKey
    }
    if (typeof updateCheck === 'boolean') settings.updateCheck = updateCheck
    return settings
  } catch {
    return {}
  }
}

export function writeSettings(next: Settings): void {
  const file = settingsPath()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  // `mode` only applies on create; an existing file keeps its bits otherwise.
  chmodSync(file, 0o600)
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
