/**
 * The network a request comes from, as the trial counts it. IPv4 is one
 * address; IPv6 is its /64, the block one connection hands out (counting
 * single IPv6 addresses let one host start trials without limit). Stored
 * only as a keyed one-way code, so the counters at the store never hold an
 * address and the code cannot be turned back into one.
 */
const enc = new TextEncoder()

/** The /64 of an IPv6 address, an IPv4 address as is, anything else as given. */
export function networkOf(address: string): string {
  const a = address.trim().toLowerCase()
  const v4 = a.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (v4) return v4[1] ?? a
  if (!a.includes(':')) return a
  const [head = '', tail = ''] = a.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = a.includes('::')
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left
  return `${groups
    .slice(0, 4)
    .map((g) => (g || '0').replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}

/** A short keyed code for a network: the same network, the same code; never the address. */
export async function networkCode(secret: string, address: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`network:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(networkOf(address)))
  return Buffer.from(mac).subarray(0, 12).toString('base64url')
}
