'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'

const POLL_MS = 5_000

/**
 * Shown in place of the documents while the server writes the kit a chase
 * asked for (lib/kit/runner.ts). Asks every five seconds and refreshes the
 * page once the kit lands — or fails, so the page can say what to do.
 */
export function KitProgress({ applicationId }: { applicationId: string }) {
  const t = useT()
  const router = useRouter()

  useEffect(() => {
    let stopped = false
    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/kit/status?applicationId=${encodeURIComponent(applicationId)}`,
          {
            cache: 'no-store',
          },
        )
        if (!res.ok || stopped) return
        const { phase } = (await res.json()) as { phase?: string }
        if (phase && phase !== 'working') {
          stopped = true
          clearInterval(timer)
          router.refresh()
        }
      } catch {
        // A missed poll is retried by the next one.
      }
    }, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [applicationId, router])

  return (
    <div role="status" className="kit-progress">
      <span className="kit-progress-dot" aria-hidden />
      <p className="kit-progress-text">{t('kit.preparing')}</p>
    </div>
  )
}
