/**
 * The trial's counters: what each trial has spent, what all trials spent
 * this month, and how often one network address asks. Upstash Redis over its
 * REST API in production (the env names the Vercel Marketplace sets), a Map
 * in tests. Never a CV, a posting or an answer: numbers under opaque keys.
 */
export type TrialStore = {
  /** Adds `by` to a counter and returns the new value; `ttlSeconds` on first write. */
  add(key: string, by: number, ttlSeconds: number): Promise<number>
  get(key: string): Promise<number>
  /** True the first time a key is claimed (until it expires), false after. */
  claim(key: string, ttlSeconds: number): Promise<boolean>
}

export function memoryStore(): TrialStore {
  const values = new Map<string, number>()
  return {
    async add(key, by) {
      const next = (values.get(key) ?? 0) + by
      values.set(key, next)
      return next
    },
    async get(key) {
      return values.get(key) ?? 0
    },
    async claim(key) {
      if (values.has(key)) return false
      values.set(key, 1)
      return true
    },
  }
}

export function upstashStore(
  url: string,
  token: string,
  doFetch: typeof fetch = fetch,
): TrialStore {
  const run = async (commands: (string | number)[][]): Promise<unknown[]> => {
    const res = await doFetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    })
    if (!res.ok) throw new Error(`store ${res.status}`)
    const out = (await res.json()) as { result?: unknown; error?: string }[]
    return out.map((r) => {
      if (r.error) throw new Error(`store: ${r.error}`)
      return r.result
    })
  }
  return {
    async add(key, by, ttlSeconds) {
      // INCRBYFLOAT, then an expiry only if the key has none yet (NX).
      const [value] = await run([
        ['INCRBYFLOAT', key, by],
        ['EXPIRE', key, ttlSeconds, 'NX'],
      ])
      return Number(value)
    },
    async get(key) {
      const [value] = await run([['GET', key]])
      return value == null ? 0 : Number(value)
    },
    async claim(key, ttlSeconds) {
      const [ok] = await run([['SET', key, 1, 'NX', 'EX', ttlSeconds]])
      return ok === 'OK'
    },
  }
}
