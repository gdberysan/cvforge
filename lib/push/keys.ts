import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import webpush from 'web-push'
import { settingsPath } from '@/lib/settings'

/**
 * The VAPID pair that signs every push, generated once and kept beside the
 * key file (never inside it: a damaged settings file must not cost the
 * phone its subscription). Resolved through settingsPath() so a scratch DB
 * run with CVFORGE_CONFIG_PATH reads the same pair as the install.
 */
export function pushKeysPath(): string {
  return path.join(/* turbopackIgnore: true */ path.dirname(settingsPath()), 'push.json')
}

/** push.json exists but cannot be read as a pair. Never regenerate over it:
 *  every phone subscribed against the old public key would silently stop. */
export class PushKeysDamaged extends Error {
  constructor(readonly file: string) {
    super(`The notification keys file is damaged: ${file}`)
    this.name = 'PushKeysDamaged'
  }
}

export function vapidKeys(): { publicKey: string; privateKey: string } {
  const file = pushKeysPath()
  if (existsSync(file)) {
    let parsed: { publicKey?: unknown; privateKey?: unknown } | null
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      throw new PushKeysDamaged(file)
    }
    const { publicKey, privateKey } = parsed ?? {}
    if (typeof publicKey === 'string' && publicKey && typeof privateKey === 'string' && privateKey)
      return { publicKey, privateKey }
    throw new PushKeysDamaged(file)
  }
  const keys = webpush.generateVAPIDKeys()
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(keys), { mode: 0o600 })
  renameSync(tmp, file)
  chmodSync(file, 0o600)
  return keys
}
