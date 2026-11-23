/**
 * Page ↔ Worker calls, typed end to end. The Worker `expose`s one object of
 * functions; the page gets a `connect<typeof api>()` client whose methods
 * have the same names, arguments and (awaited) results. Errors cross as
 * { name, message, code } and are rethrown as Errors with `code` kept, so the
 * page's errorText(t, code, message) works as it does for server actions.
 *
 * Progress (what SSE carried on the desktop) rides the same channel: a
 * function's last argument may be a callback, sent as a marker and invoked
 * on the page for every `progress` message of that call.
 */

// biome-ignore lint/suspicious/noExplicitAny: an RPC surface is any function
type AnyFn = (...args: any[]) => unknown
export type Api = Record<string, AnyFn>

export type Client<A extends Api> = {
  [K in keyof A]: (...args: Parameters<A[K]>) => Promise<Awaited<ReturnType<A[K]>>>
}

type Request = { id: number; method: string; args: unknown[]; progressAt: number | null }
type Response =
  | { id: number; kind: 'result'; value: unknown }
  | { id: number; kind: 'error'; error: { name: string; message: string; code?: string } }
  | { id: number; kind: 'progress'; value: unknown }

const PROGRESS = '__cvforge_progress__'

export type Port = {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  /** MessagePort needs it when listened to with addEventListener; a Worker has none. */
  start?(): void
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    name = 'RpcError',
  ) {
    super(message)
    this.name = name
  }
}

/** Worker side: answer calls on `port` from `api`. */
export function expose(api: Api, port: Port): void {
  port.start?.()
  port.addEventListener('message', async (event: MessageEvent) => {
    const req = event.data as Request
    if (typeof req?.id !== 'number' || typeof req.method !== 'string') return
    const fn = api[req.method]
    if (!fn) {
      port.postMessage({
        id: req.id,
        kind: 'error',
        error: {
          name: 'RpcError',
          message: `unknown method ${req.method}`,
          code: 'unknown-method',
        },
      } satisfies Response)
      return
    }
    const args = [...req.args]
    if (req.progressAt !== null) {
      args[req.progressAt] = (value: unknown) =>
        port.postMessage({ id: req.id, kind: 'progress', value } satisfies Response)
    }
    try {
      const value = await fn(...args)
      port.postMessage({ id: req.id, kind: 'result', value } satisfies Response)
    } catch (err) {
      const e = err as { name?: string; message?: string; code?: unknown }
      port.postMessage({
        id: req.id,
        kind: 'error',
        error: {
          name: e?.name ?? 'Error',
          message: e?.message ?? String(err),
          ...(typeof e?.code === 'string' ? { code: e.code } : {}),
        },
      } satisfies Response)
    }
  })
}

/** Page side: a typed client for the api the Worker exposes. */
export function connect<A extends Api>(port: Port): Client<A> {
  port.start?.()
  let seq = 0
  const call = (method: string, args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      const fnAt = args.findIndex((a) => typeof a === 'function')
      const onProgress = fnAt >= 0 ? (args[fnAt] as (v: unknown) => void) : null
      const sent = fnAt >= 0 ? args.map((a, i) => (i === fnAt ? PROGRESS : a)) : args
      const listener = (event: MessageEvent) => {
        const res = event.data as Response
        if (res?.id !== id) return
        if (res.kind === 'progress') {
          onProgress?.(res.value)
          return
        }
        port.removeEventListener('message', listener)
        if (res.kind === 'result') resolve(res.value)
        else reject(new RpcError(res.error.message, res.error.code, res.error.name))
      }
      port.addEventListener('message', listener)
      port.postMessage({
        id,
        method,
        args: sent,
        progressAt: fnAt >= 0 ? fnAt : null,
      } satisfies Request)
    })
  return new Proxy({} as Client<A>, {
    // `then` must not look like a method: a client returned from an async
    // function or a Promise would be taken for a thenable and "called".
    get: (_t, method) =>
      typeof method === 'string' && method !== 'then'
        ? (...args: unknown[]) => call(method, args)
        : undefined,
  })
}
