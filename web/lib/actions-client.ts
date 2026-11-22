/**
 * The page side of the bridge: what the generated stand-ins in web/actions/
 * call. Waits for the database to be open (DatabaseProvider hands over the
 * Worker client once it is), then asks the Worker to run the desktop action.
 * Every call that may have changed data tells the screens to reload theirs —
 * the browser's revalidatePath.
 */
import type { WorkerApi } from '@/web/worker/api'
import type { Client } from './rpc'

let resolveApi: (api: Client<WorkerApi>) => void = () => {}
let ready: Promise<Client<WorkerApi>> = new Promise((r) => {
  resolveApi = r
})

const listeners = new Set<() => void>()

export function setWorkerApi(api: Client<WorkerApi> | null): void {
  if (api) resolveApi(api)
  else
    ready = new Promise((r) => {
      resolveApi = r
    })
}

export function workerApi(): Promise<Client<WorkerApi>> {
  return ready
}

/** Screens subscribe to reload their data after any change. */
export function onDataChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function dataChanged(): void {
  for (const fn of listeners) fn()
}

export async function callAction(key: string, name: string, args: unknown[]): Promise<unknown> {
  const api = await ready
  try {
    return await api.action(key, name, args)
  } finally {
    dataChanged()
  }
}

/** A desktop-only action reached from the browser edition: a typed refusal. */
export async function notInBrowser(key: string, name: string): Promise<never> {
  throw Object.assign(new Error(`${key}#${name} is part of the desktop app only.`), {
    code: 'not-in-browser',
  })
}
