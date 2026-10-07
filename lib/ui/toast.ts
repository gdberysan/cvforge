/**
 * One confirmation at a time, for actions that change a list underneath the
 * button that triggered them — logging an outcome can remove the very card it
 * was clicked on. The host lives in the layout, so the message (and its undo)
 * outlives the component that raised it.
 */
export type Toast = { id: number; label: string; undo?: () => Promise<void> | void }

type Listener = (toast: Toast | null) => void
const listeners = new Set<Listener>()
let seq = 0

export function showToast(label: string, undo?: Toast['undo']): void {
  const toast = { id: ++seq, label, undo }
  for (const l of listeners) l(toast)
}

export function onToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
