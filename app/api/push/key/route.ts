import { NextResponse } from 'next/server'
import { getTranslate } from '@/lib/i18n/server'
import { PushKeysDamaged, vapidKeys } from '@/lib/push/keys'

/** The public half of the VAPID pair, for the phone's subscribe call. */
export async function GET() {
  try {
    return NextResponse.json({ publicKey: vapidKeys().publicKey })
  } catch (error) {
    if (!(error instanceof PushKeysDamaged)) throw error
    const { t } = await getTranslate()
    return NextResponse.json(
      { error: t('push.keysDamaged', { file: error.file }) },
      { status: 500 },
    )
  }
}
