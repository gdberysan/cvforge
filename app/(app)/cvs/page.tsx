import { redirect } from 'next/navigation'
import { CvsView } from '@/components/pages/SmallViews'
import { db } from '@/lib/db/client'
import { getTranslate } from '@/lib/i18n/server'
import { loadCvs } from '@/lib/pages/small'

export const dynamic = 'force-dynamic'

export default async function BaseCvsPage() {
  const { t } = await getTranslate()
  const data = loadCvs(db)
  if (!data) redirect('/')
  return <CvsView data={data} t={t} />
}
