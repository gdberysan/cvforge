/**
 * Paid model calls in progress, so a restore cannot pull the database out
 * from under one. A run reads the database, spends minutes on model calls,
 * then saves what it bought; a backup restored in between left the save
 * writing to a different database — or to an application that no longer
 * existed — and the paid result was lost.
 *
 * Tracked at callStructured, the one door every paid call goes through, so
 * no route or server action can forget to register. The save that follows a
 * run's last call happens within milliseconds, which LINGER_MS covers with a
 * wide margin; so do the code checks between one call and the next.
 *
 * On globalThis: route handlers, pages and server actions each have their own
 * module registry, and a counter in module scope would be zero in the
 * restore route while a compose ran in another.
 */
const LINGER_MS = 15_000

const state = globalThis as unknown as {
  __cvforgeInFlight?: { open: number; lastEnd: number }
  __cvforgeLedger?: PaidCallLedger | null
}

/**
 * A durable record of calls in flight (the web edition's database): opened
 * before a call is sent, closed when it ends, so a call the page did not
 * survive is still on record. Failures here never stop the call.
 */
export type PaidCallLedger = {
  open: (call: { stage: string; model: string }) => string
  close: (id: string) => void
}

export function setPaidCallLedger(ledger: PaidCallLedger | null): void {
  state.__cvforgeLedger = ledger
}

function counter() {
  state.__cvforgeInFlight ??= { open: 0, lastEnd: 0 }
  return state.__cvforgeInFlight
}

/** Runs one paid call as in flight. */
export async function trackPaidCall<T>(
  call: () => Promise<T>,
  meta: { stage: string; model: string } = { stage: 'unknown', model: 'unknown' },
): Promise<T> {
  const c = counter()
  c.open++
  let entry: string | null = null
  try {
    entry = state.__cvforgeLedger?.open(meta) ?? null
  } catch {
    // A ledger that cannot write must not cost the person the call.
  }
  try {
    return await call()
  } finally {
    c.open--
    c.lastEnd = Date.now()
    try {
      if (entry) state.__cvforgeLedger?.close(entry)
    } catch {
      // Left open, it reads as an interrupted call on the next open: an
      // unknown cost overstated, never a real one hidden.
    }
  }
}

/** True while a paid call is open, or one ended too recently for its result to be saved yet. */
export function paidRunInFlight(now: number = Date.now()): boolean {
  const c = counter()
  return c.open > 0 || now - c.lastEnd < LINGER_MS
}
