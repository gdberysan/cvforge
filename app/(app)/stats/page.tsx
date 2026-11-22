import { StatsView } from '@/components/pages/StatsView'
import { db } from '@/lib/db/client'
import { getTranslate } from '@/lib/i18n/server'
import { loadStats } from '@/lib/pages/stats'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const { t } = await getTranslate()
  return <StatsView data={loadStats(db)} t={t} />
}
