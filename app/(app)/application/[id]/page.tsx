import { notFound } from 'next/navigation'
import { ApplicationView } from '@/components/pages/ApplicationView'
import { db } from '@/lib/db/client'
import { isDemo } from '@/lib/demo/mode'
import { getTranslate } from '@/lib/i18n/server'
import { loadApplication, type MailAgent } from '@/lib/pages/application'
import { listMailThread, readMailStatus } from '@/lib/satellite/mail'
import { isAgentAvailable } from '@/lib/satellite/settings'
import { satelliteDbPath } from '@/lib/settings'

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

/** The job agent's mail, when this install has a reachable agent. */
function mailAgent(): MailAgent | null {
  const file = satelliteDbPath()
  if (!isAgentAvailable(file)) return null
  return {
    status: () => readMailStatus(file),
    thread: (applicationId) => listMailThread(file, applicationId),
  }
}
