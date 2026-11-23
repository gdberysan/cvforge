import { notFound } from 'next/navigation'
import { mailAgent } from '#satellite'
import { ApplicationView } from '@/components/pages/ApplicationView'
import { db } from '@/lib/db/client'
import { isDemo } from '@/lib/demo/mode'
import { getTranslate } from '@/lib/i18n/server'
import { loadApplication } from '@/lib/pages/application'

/** One application (components/pages/ApplicationView.tsx) on the desktop's own data. */
export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ gapdelta?: string; step?: string }>
}) {
  const { t, locale } = await getTranslate()
  const data = loadApplication(db, {
    id: (await params).id,
    search: await searchParams,
    locale,
    demo: isDemo(),
    mail: mailAgent(),
  })
  if (!data) notFound()
  return <ApplicationView data={data} t={t} locale={locale} />
}
