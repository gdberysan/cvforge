'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { EvidenceView } from '@/components/pages/EvidenceView'
import { useLoader } from '@/web/lib/use-loader'

/** Experiencia on this browser's data; with no profile, home is the one thing to do. */
export default function Page() {
  const t = useT()
  const router = useRouter()
  const data = useLoader('evidence')
  useEffect(() => {
    if (data === null) router.replace('/')
  }, [data, router])
  if (!data) return null
  return <EvidenceView data={data} t={t} />
}
