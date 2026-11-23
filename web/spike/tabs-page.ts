import { claimDatabase } from '@/web/lib/tab-lock'

const worker = new Worker('./tabs-worker.js', { type: 'module' })
let seq = 0
const call = (op: string, extra: object = {}) =>
  new Promise<unknown>((resolve, reject) => {
    const id = ++seq
    const onMsg = (e: MessageEvent) => {
      if (e.data.id !== id) return
      worker.removeEventListener('message', onMsg)
      e.data.ok ? resolve(e.data.result) : reject(new Error(e.data.error))
    }
    worker.addEventListener('message', onMsg)
    worker.postMessage({ id, op, ...extra })
  })

const w = window as unknown as Record<string, unknown>
w.events = [] as string[]
const hooks = {
  open: () => call('open').then(() => undefined),
  close: () => call('close').then(() => undefined),
  onLost: () => (w.events as string[]).push('lost'),
}
w.claim = (steal = false) => claimDatabase(navigator.locks, hooks, { steal })
w.call = call
w.ready = true
