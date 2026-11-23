/**
 * The web edition's lib/settings: the same exports, held in the Worker's
 * memory and kept in a small JSON file in the origin's private storage
 * (OPFS), beside — not inside — the database. `loadSettings` runs when the
 * database opens; every write is saved, in order. Nothing leaves the browser.
 */
import type { Settings } from '../../lib/settings'

export type { Settings }

let current: Settings = {}

export function settingsPath(): string {
  return 'browser'
}

export function readSettings(): Settings {
  return { ...current }
}

const FILE = 'cvforge-settings.json'
let saving: Promise<void> = Promise.resolve()

async function root(): Promise<FileSystemDirectoryHandle | null> {
  return typeof navigator !== 'undefined' && navigator.storage?.getDirectory
    ? navigator.storage.getDirectory()
    : null
}

/** Reads the saved settings into memory; missing or unreadable means none. */
export async function loadSettings(): Promise<void> {
  const dir = await root()
  if (!dir) return
  try {
    const file = await (await dir.getFileHandle(FILE)).getFile()
    const parsed: unknown = JSON.parse(await file.text())
    if (parsed && typeof parsed === 'object') current = parsed as Settings
  } catch {
    current = {}
  }
}

/** Resolves once every write so far is on disk. */
export function settingsSaved(): Promise<void> {
  return saving
}

/**
 * With the password lock on, settings never touch a plain file: they are
 * sealed with the database (web/worker/db.ts), which this sink tells.
 */
let sink: (() => void) | null = null
export function setSettingsSink(next: (() => void) | null): void {
  sink = next
}
export function replaceSettings(next: Record<string, unknown>): void {
  current = { ...(next as Settings) }
}
export function readSettingsSnapshot(): Record<string, unknown> {
  return { ...current }
}

export function writeSettings(next: Settings): void {
  current = { ...next }
  if (sink) {
    sink()
    return
  }
  const snapshot = JSON.stringify(current)
  saving = saving.then(async () => {
    const dir = await root()
    if (!dir) return
    const handle = await dir.getFileHandle(FILE, { create: true })
    const writable = await handle.createWritable()
    await writable.write(snapshot)
    await writable.close()
  })
}

export const MAX_KIT_DAILY_CAP = 10
export const isKitCap = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_KIT_DAILY_CAP

export function kitOnChase(): boolean {
  return current.kitOnChase ?? true
}

export function kitDailyCap(): number {
  return current.kitDailyCap ?? 5
}

export function clearApiKey(): void {
  const { anthropicApiKey: _removed, ...rest } = current
  writeSettings(rest)
}

export function satelliteDbPath(): string | undefined {
  return undefined
}

export function hasCredentials(): boolean {
  return Boolean(current.anthropicApiKey) || onTrial()
}

/** A free-trial pass that is still good, with no key of the person's own. */
export function onTrial(): boolean {
  return !current.anthropicApiKey && Boolean(current.trialToken) && !current.trialEnded
}

/** Drops the settings held in memory (the file goes with the rest of OPFS). */
export function forgetSettings(): void {
  current = {}
}
