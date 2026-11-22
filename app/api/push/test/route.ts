import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getTranslate } from '@/lib/i18n/server'
import { PushKeysDamaged } from '@/lib/push/keys'
import { notify } from '@/lib/push/notify'

/** "Send a test" in Ajustes. Ignores quiet hours: the person is looking at the screen. */
export async function POST() {
  const { t } = await getTranslate()
  try {
    const result = await notify(db, {
      kind: 'test',
      title: 'CVForge',
      body: t('push.testBody'),
      url: '/settings',
    })
    return NextResponse.json({ result })
  } catch (error) {
    if (!(error instanceof PushKeysDamaged)) throw error
    return NextResponse.json(
      { error: t('push.keysDamaged', { file: error.file }) },
      { status: 500 },
    )
  }
}
