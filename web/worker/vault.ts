/**
 * The password lock's file format. With a password set, everything CVForge
 * keeps in the browser — the database and the settings with the Anthropic
 * key — lives on disk only as one sealed file, and is opened into memory
 * when the person types the password.
 *
 * Layout of `cvforge.vault`:
 *   "CVFV1" (5 bytes) · salt (16) · PBKDF2 iterations (4, big-endian) ·
 *   IV (12) · AES-256-GCM ciphertext of the payload
 * Payload: settings JSON length (4, big-endian) · settings JSON (UTF-8) ·
 *   the SQLite database file.
 *
 * The key is derived from the password with PBKDF2-SHA-256 (600,000
 * iterations, OWASP's 2023 figure) and a random salt; every save uses a fresh
 * random IV. GCM authenticates: a wrong password or one changed byte fails to
 * open rather than yielding garbage. There is no recovery: without the
 * password the file is noise. Pure functions over WebCrypto, so the same code
 * runs in the Worker and in tests.
 */

export const VAULT_FILE = 'cvforge.vault'
const MAGIC = new TextEncoder().encode('CVFV1')
export const ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12
const HEADER = MAGIC.length + SALT_BYTES + 4 + IV_BYTES

export type Unlocked = { key: CryptoKey; salt: Uint8Array; iterations: number }
export type Payload = { settings: Record<string, unknown>; db: Uint8Array }

export class WrongPassword extends Error {
  constructor() {
    super('wrong password or damaged vault')
    this.name = 'WrongPassword'
  }
}

export function isVault(bytes: Uint8Array): boolean {
  return bytes.length > HEADER && MAGIC.every((b, i) => bytes[i] === b)
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** A new key for a new password (fresh salt). */
export async function newKey(password: string, iterations = ITERATIONS): Promise<Unlocked> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return { key: await derive(password, salt, iterations), salt, iterations }
}

function pack(p: Payload): Uint8Array {
  const settings = new TextEncoder().encode(JSON.stringify(p.settings))
  const out = new Uint8Array(4 + settings.length + p.db.length)
  new DataView(out.buffer).setUint32(0, settings.length)
  out.set(settings, 4)
  out.set(p.db, 4 + settings.length)
  return out
}

function unpack(bytes: Uint8Array): Payload {
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  const settings = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)))
  return { settings, db: bytes.slice(4 + n) }
}

export async function seal(unlocked: Unlocked, payload: Payload): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      unlocked.key,
      pack(payload) as BufferSource,
    ),
  )
  const out = new Uint8Array(HEADER + sealed.length)
  out.set(MAGIC, 0)
  out.set(unlocked.salt, MAGIC.length)
  new DataView(out.buffer).setUint32(MAGIC.length + SALT_BYTES, unlocked.iterations)
  out.set(iv, MAGIC.length + SALT_BYTES + 4)
  out.set(sealed, HEADER)
  return out
}

/** Opens a vault with a password: the payload and the key to save it again. */
export async function open(
  bytes: Uint8Array,
  password: string,
): Promise<{ payload: Payload; unlocked: Unlocked }> {
  if (!isVault(bytes)) throw new WrongPassword()
  const salt = bytes.slice(MAGIC.length, MAGIC.length + SALT_BYTES)
  const iterations = new DataView(bytes.buffer, bytes.byteOffset).getUint32(
    MAGIC.length + SALT_BYTES,
  )
  const iv = bytes.slice(MAGIC.length + SALT_BYTES + 4, HEADER)
  const key = await derive(password, salt, iterations)
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      bytes.subarray(HEADER) as BufferSource,
    )
  } catch {
    throw new WrongPassword()
  }
  return { payload: unpack(new Uint8Array(plain)), unlocked: { key, salt, iterations } }
}
