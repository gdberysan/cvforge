'use client'

/**
 * The page's door to the Worker that owns the database. Claims the tab lock
 * first (one tab owns the data), then starts the Worker, opens the database
 * and hands every screen a typed client. The states a person can see:
 * opening, ready, busy (another tab has it), moved (another tab took it),
 * unsupported (no OPFS or Web Locks), failed.
 */
import '@/web/lib/zod-jitless'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { WorkerApi } from '@/web/worker/api'
import { dataChanged, setWorkerApi } from './actions-client'
import { installDownloadBridge, installFetchBridge } from './fetch-bridge'
import { chosenLocale } from './locale'
import { type Client, connect } from './rpc'
import { claimDatabase } from './tab-lock'

export type DbState =
  | { kind: 'opening' }
  | { kind: 'locked'; api: Client<WorkerApi> }
  | { kind: 'ready'; api: Client<WorkerApi>; persisted: boolean; interrupted: number }
  | { kind: 'busy' }
  | { kind: 'moved' }
  | { kind: 'unsupported' }
  | { kind: 'failed'; message: string }

type Ctx = {
  state: DbState
  takeOver: () => void
  /** After the password opened the vault (or the lock was just turned on/off). */
  unlocked: (interrupted: number) => void
  /** After "Bloquear ahora": back to the password screen. */
  locked: () => void
}
const DatabaseContext = createContext<Ctx>({
  state: { kind: 'opening' },
  takeOver: () => {},
  unlocked: () => {},
  locked: () => {},
})

function supported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'locks' in navigator &&
    typeof navigator.storage?.getDirectory === 'function' &&
    typeof Worker !== 'undefined'
  )
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DbState>({ kind: 'opening' })
  const worker = useRef<Worker | null>(null)
  const persistedRef = useRef(false)
  const apiRef = useRef<Client<WorkerApi> | null>(null)

  const start = useCallback((steal: boolean) => {
    if (!supported()) {
      setState({ kind: 'unsupported' })
      return
    }
    // Built by scripts/build-web-worker.ts (esbuild), served as a static file.
    worker.current ??= new Worker('/worker/cvforge-worker.js', { type: 'module' })
    const api = connect<WorkerApi>(worker.current)
    apiRef.current = api
    let opened = { locked: false, interrupted: 0 }
    claimDatabase(
      navigator.locks,
      {
        open: async () => {
          opened = await api.open()
        },
        close: () => api.close(),
        onLost: () => {
          setWorkerApi(null)
          setState({ kind: 'moved' })
        },
      },
      { steal },
    )
      .then(async (role) => {
        if (role.kind === 'busy') {
          // Arriving from the phone's share sheet is an unambiguous "here":
          // take the data over rather than ask (an older CVForge tab is
          // usually still open in the browser).
          if (!steal && new URLSearchParams(location.search).has('shared')) {
            setState({ kind: 'opening' })
            start(true)
            return
          }
          return setState({ kind: 'busy' })
        }
        if (role.kind === 'unsupported') return setState({ kind: 'unsupported' })
        // Ask the browser not to evict the data under storage pressure. It
        // may say no; the screen says so rather than pretending.
        const persisted = await navigator.storage.persist().catch(() => false)
        persistedRef.current = persisted
        await api.setLocale(chosenLocale())
        // Protected by a password: the data opens only once it is typed.
        if (opened.locked) return setState({ kind: 'locked', api })
        setWorkerApi(api)
        // Local development and tests only: the Worker from the console.
        if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
          ;(window as unknown as { cvforgeDebug?: unknown }).cvforgeDebug = api
        }
        setState({ kind: 'ready', api, persisted, interrupted: opened.interrupted })
      })
      .catch((err: unknown) =>
        setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) }),
      )
  }, [])

  useEffect(() => {
    installFetchBridge()
    installDownloadBridge()
    start(false)
    // With the password lock on, a change is sealed within a second; when
    // the page is hidden (switching apps, closing the tab) seal at once.
    const flush = () => {
      if (document.visibilityState === 'hidden') void apiRef.current?.flush()
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [start])

  const unlocked = useCallback((interrupted: number) => {
    const api = apiRef.current
    if (!api) return
    setWorkerApi(api)
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
      ;(window as unknown as { cvforgeDebug?: unknown }).cvforgeDebug = api
    }
    setState({ kind: 'ready', api, persisted: persistedRef.current, interrupted })
    // Screens that asked for data before the unlock ask again now.
    dataChanged()
  }, [])

  const locked = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    setWorkerApi(null)
    setState({ kind: 'locked', api })
  }, [])

  const takeOver = useCallback(() => {
    setState({ kind: 'opening' })
    start(true)
  }, [start])

  return (
    <DatabaseContext.Provider value={{ state, takeOver, unlocked, locked }}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase(): Ctx {
  return useContext(DatabaseContext)
}
