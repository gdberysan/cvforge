'use client'

import { useEffect, useState } from 'react'
import { onToast, type Toast } from '@/lib/ui/toast'
import { UndoBar } from './UndoBar'

/** Shows the latest confirmation for six seconds, with its undo when it has one. */
export function ToastHost() {
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => onToast(setToast), [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), 6000)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null
  return (
    <UndoBar
      label={toast.label}
      onUndo={
        toast.undo
          ? () => {
              const undo = toast.undo
              setToast(null)
              void undo?.()
            }
          : undefined
      }
      onDismiss={() => setToast(null)}
    />
  )
}
