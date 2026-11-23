import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { deleteSubscription, listSubscriptions, saveSubscription } from '@/lib/push/store'

/**
 * The push services browsers actually hand out. The Mac POSTs to whatever
 * endpoint is stored here, so it must never be an arbitrary host: Chrome
 * (Android included) uses FCM, Firefox Mozilla's service, Safari Apple's,
 * Edge on Windows WNS.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
]

function isPushService(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(host))
  } catch {
    return false
  }
}

const Body = z.object({
  subscription: z.object({
    endpoint: z.string().refine(isPushService),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  label: z.string().max(60).default(''),
})

/** Every device that receives notifications. */
export function GET() {
  return NextResponse.json({
    devices: listSubscriptions(db).map((s) => ({
      endpoint: s.endpoint,
      label: s.label,
      lastOkAt: s.lastOkAt,
    })),
  })
}

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json(
      { error: 'Not a push subscription.', code: 'invalid-request' },
      { status: 400 },
    )
  }
  const { subscription, label } = body.data
  saveSubscription(db, {
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    label,
  })
  return NextResponse.json({ ok: true })
}

export function DELETE(request: Request) {
  const endpoint = new URL(request.url).searchParams.get('endpoint')
  if (!endpoint) {
    return NextResponse.json(
      { error: 'endpoint is required', code: 'invalid-request' },
      { status: 400 },
    )
  }
  deleteSubscription(db, endpoint)
  return NextResponse.json({ ok: true })
}
