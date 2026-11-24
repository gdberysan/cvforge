/**
 * What a paid call is for: the action the person started, its application,
 * and the run that groups the calls it makes. Set once where an action starts
 * (`withSpendContext` in a route), read by the spend recorder at every call,
 * so a cost can be shown per application and an action's typical cost before
 * its button is pressed.
 *
 * The store is registered per runtime, on globalThis (route handlers and
 * pages have separate module registries; see CLAUDE.md): the desktop server
 * uses Node's AsyncLocalStorage, which follows each request exactly; the
 * browser Worker has none, and uses a single slot that goes blank while two
 * runs overlap. A call recorded without a context is unattributed, never
 * attributed to the wrong application.
 */
export type SpendAction =
  | 'analysis'
  | 'cv'
  | 'letter'
  | 'answers'
  | 'message'
  | 'prep'
  | 'import'
  | 'gaps'
  | 'interview'
  | 'base-cv'
  | 'translate'
  | 'screenshots'

export type SpendContext = { action: SpendAction; applicationId?: string; runId: string }

export type SpendContextStore = {
  run<T>(context: SpendContext, fn: () => Promise<T>): Promise<T>
  get(): SpendContext | undefined
}

const g = globalThis as unknown as { __cvforgeSpendContext?: SpendContextStore | null }

export function setSpendContextStore(store: SpendContextStore | null): void {
  g.__cvforgeSpendContext = store
}

/** Runs `fn` as one action; every paid call inside it is recorded as part of that run. */
export function withSpendContext<T>(
  context: { action: SpendAction; applicationId?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const store = g.__cvforgeSpendContext
  if (!store) return fn()
  return store.run({ ...context, runId: `run_${crypto.randomUUID()}` }, fn)
}

export function currentSpendContext(): SpendContext | undefined {
  try {
    return g.__cvforgeSpendContext?.get()
  } catch {
    return undefined
  }
}

/**
 * For a runtime with no async context (the browser Worker): the one run in
 * progress. While a second one overlaps it, there is no telling which run a
 * call belongs to, so none is told.
 */
export function singleSlotStore(): SpendContextStore {
  const active: SpendContext[] = []
  return {
    async run(context, fn) {
      active.push(context)
      try {
        return await fn()
      } finally {
        active.splice(active.indexOf(context), 1)
      }
    },
    get: () => (active.length === 1 ? active[0] : undefined),
  }
}
