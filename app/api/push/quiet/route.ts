import { NextResponse } from 'next/server'
import { z } from 'zod'
import { DEFAULT_QUIET } from '@/lib/push/quiet'
import { readSettings, writeSettings } from '@/lib/settings'

const Hour = z.number().int().min(0).max(23)
const Body = z.object({ start: Hour, end: Hour })

export function GET() {
  return NextResponse.json(readSettings().pushQuietHours ?? DEFAULT_QUIET)
}

/** Equal start and end means no quiet hours at all (lib/push/quiet.ts). */
export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json({ error: 'Hours are 0–23.', code: 'invalid-request' }, { status: 400 })
  }
  writeSettings({ ...readSettings(), pushQuietHours: body.data })
  return NextResponse.json({ ok: true })
}
