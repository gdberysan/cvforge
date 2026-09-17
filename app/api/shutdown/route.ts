import { NextResponse } from 'next/server'
import { isDemo } from '@/lib/demo/mode'
import { isSameOriginRequest } from '@/lib/http/same-origin'

/**
 * The packaged app has no terminal window to close, so quitting lives in the
 * product: the nav's "apagar" posts here. Data needs no flushing — every
 * change was committed to SQLite when it happened — so exiting is always
 * safe. The response goes out first; the process follows it down.
 *
 * Same-origin proof required — see lib/http/same-origin.ts for why the
 * Origin/Host match alone is not enough.
 */
export async function POST(request: Request) {
  if (isDemo()) {
    return NextResponse.json({ error: 'demo' }, { status: 403 })
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  setTimeout(() => process.exit(0), 300)
  return NextResponse.json({ ok: true })
}
