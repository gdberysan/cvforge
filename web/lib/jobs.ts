'use client'

/**
 * Long jobs (a triage, a CV import, a CV) run in the Worker for up to a few
 * minutes. A phone that leaves the page — the screen sleeping, another app —
 * freezes it, and may discard it. While any job runs: the screen is kept
 * awake (Screen Wake Lock, re-taken when the page comes back), and the shell
 * asks the person to keep CVForge open. Counted at the fetch bridge, where
 * every streamed job passes.
 */
let running = 0
const listeners = new Set<(n: number) => void>()
let lock: { release(): Promise<void> } | null = null

async function holdScreen(): Promise<void> {
  if (lock || running === 0 || document.visibilityState !== 'visible') return
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> }
    }
    const held = (await nav.wakeLock?.request('screen')) ?? null
    lock = held
    // The browser releases it on its own when the page is hidden.
    ;(held as unknown as EventTarget | null)?.addEventListener('release', () => {
      if (lock === held) lock = null
    })
  } catch {
    lock = null // denied (battery saver, unsupported): the notice still shows
  }
}

function emit(): void {
  for (const fn of listeners) fn(running)
}

export function jobStarted(): void {
  running++
  emit()
  void holdScreen()
}

export function jobEnded(): void {
  running = Math.max(0, running - 1)
  emit()
  if (running === 0 && lock) {
    void lock.release().catch(() => {})
    lock = null
  }
}

export function onJobs(fn: (n: number) => void): () => void {
  listeners.add(fn)
  fn(running)
  return () => listeners.delete(fn)
}

if (typeof document !== 'undefined') {
  // A wake lock ends whenever the page is hidden; take it again on return.
  document.addEventListener('visibilitychange', () => void holdScreen())
}
