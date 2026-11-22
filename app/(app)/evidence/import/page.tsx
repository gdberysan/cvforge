import { ImportView } from '@/components/pages/SmallViews'
import { db } from '@/lib/db/client'
import { getTranslate } from '@/lib/i18n/server'
import { loadImport } from '@/lib/pages/small'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const { t } = await getTranslate()
  return <ImportView data={loadImport(db)} t={t} />
}
