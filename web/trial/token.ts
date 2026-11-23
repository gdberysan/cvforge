/**
 * A trial pass: `t1.<id>.<expires>.<signature>`, signed with the server's
 * secret (HMAC-SHA256). It says only "this browser started a trial, and
 * until when"; what the trial has spent lives in the store, under the id.
 */
const enc = new TextEncoder()

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

function b64url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString('base64url')
}

async function sign(secret: string, body: string): Promise<string> {
  return b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)))
}

export async function issueToken(secret: string, id: string, expiresAt: number): Promise<string> {
  const body = `t1.${id}.${expiresAt}`
  return `${body}.${await sign(secret, body)}`
}

/** The trial id, or null when the pass is forged, malformed or expired. */
export async function readToken(
  secret: string,
  token: string,
  now: number,
): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 't1') return null
  const [, id = '', exp = ''] = parts
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id) || !/^\d+$/.test(exp)) return null
  const expected = await sign(secret, `t1.${id}.${exp}`)
  // Constant-time compare of two short strings.
  const got = parts[3] ?? ''
  if (got.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return null
  if (Number(exp) < now) return null
  return id
}
