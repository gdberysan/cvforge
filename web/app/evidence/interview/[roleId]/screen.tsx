'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { InterviewView } from '@/components/pages/SmallViews'
import { NotInData } from '@/web/lib/not-found'
import { useRouteId } from '@/web/lib/route-id'
import { useLoader } from '@/web/lib/use-loader'

function Interview({ roleId }: { roleId: string }) {
  const t = useT()
  const data = useLoader('interview', { roleId })
  if (data === undefined) return null
  if (data === null) return <NotInData />
  return <InterviewView data={data} t={t} />
}

export function InterviewScreen() {
  const roleId = useRouteId('/evidence/interview/')
  return roleId ? <Interview key={roleId} roleId={roleId} /> : null
}
