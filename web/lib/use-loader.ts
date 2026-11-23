'use client'

/**
 * A screen's data from the Worker, reloaded whenever anything changed it —
 * the browser edition's server render plus revalidatePath in one hook.
 * `undefined` until the first answer; after that, whatever the loader
 * returned (a loader may answer null, e.g. "no profile yet").
 */
import { useEffect, useState } from 'react'
import type { LoaderArgs, LoaderName, Loaders } from '@/web/worker/loaders'
import { onDataChanged, workerApi } from './actions-client'

type Loaded<N extends LoaderName> = Awaited<ReturnType<Loaders[N]>>

export function useLoader<N extends LoaderName>(
  name: N,
  args?: LoaderArgs<N>,
): Loaded<N> | undefined {
  const [data, setData] = useState<Loaded<N> | undefined>(undefined)
  // Arguments compared by value: a new object each render must not refetch.
  const key = JSON.stringify(args ?? null)
  useEffect(() => {
    let live = true
    const run = () =>
      workerApi()
        .then((api) => api.load(name, JSON.parse(key)))
        .then((value) => {
          if (live) setData(value as Loaded<N>)
        })
    run()
    const stop = onDataChanged(run)
    return () => {
      live = false
      stop()
    }
  }, [name, key])
  return data
}
