import { notFound } from 'next/navigation'
import { InterviewView } from '@/components/pages/SmallViews'
import { db } from '@/lib/db/client'
import { getTranslate } from '@/lib/i18n/server'
import { loadInterview } from '@/lib/pages/small'

export default async function InterviewPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { t } = await getTranslate()
  const data = loadInterview(db, (await params).roleId)
  if (!data) notFound()
  return <InterviewView data={data} t={t} />
}
