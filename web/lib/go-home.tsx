'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** A screen that needs a profile, opened without one: home is the one thing to do. */
export function GoTo({ href }: { href: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(href)
  }, [href, router])
  return null
}
