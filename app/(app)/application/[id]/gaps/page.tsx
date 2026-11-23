import { notFound, redirect } from 'next/navigation'
import { GapsView } from '@/components/pages/SmallViews'
import { db } from '@/lib/db/client'
import { getTranslate } from '@/lib/i18n/server'
import { loadGaps } from '@/lib/pages/small'

export default async function GapsPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getTranslate()
  const data = loadGaps(db, (await params).id)
  if (!data) notFound()
  if (data.redirect !== null) redirect(data.redirect)
  return <GapsView data={data} t={t} />
}
