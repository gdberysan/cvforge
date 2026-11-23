import { PipelineView } from '@/components/pages/PipelineView'
import { db } from '@/lib/db/client'
import { isDemo } from '@/lib/demo/mode'
import { getTranslate } from '@/lib/i18n/server'
import { loadPipeline } from '@/lib/pages/pipeline'

/**
 * Read from SQLite on every request. Prerendering this at build time would
 * freeze whatever the database happened to hold when the build ran — on the
 * home page that means shipping the first-run import screen to someone who
 * already has a profile.
 */
export const dynamic = 'force-dynamic'

/** Repeated keys (?q=a&q=b) arrive as arrays; the first one wins, never a crash. */
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { t, locale } = await getTranslate()
  const sp = await searchParams
  const data = loadPipeline(db, {
    search: { show: one(sp.show), q: one(sp.q), status: one(sp.status) },
    locale,
    demo: isDemo(),
  })
  return <PipelineView data={data} t={t} />
}
