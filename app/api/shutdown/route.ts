import { NextResponse } from 'next/server'
import { isDemo } from '@/lib/demo/mode'
import { doorOf, tailnetConfig } from '@/lib/http/doors'
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
  // Defence in depth behind the guard's path check: whatever spelling of
  // this path reached the handler, only the Mac itself may run it.
  if (doorOf(request.headers, tailnetConfig()) !== 'local') {
    return NextResponse.json(
      { error: 'Only from the Mac itself.', code: 'mac-only' },
      { status: 403 },
    )
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  setTimeout(stop, 300)
  return NextResponse.json({ ok: true })
}

/**
 * Under launchd (the always-on personal install) the job has KeepAlive, so
 * exiting would only restart it: "apagar" there means "stop until next
 * login", which is launchd's bootout. Elsewhere the process just exits.
 */
function stop() {
  if (process.env.CVFORGE_LAUNCHD === '1') {
    void import('node:child_process').then(({ spawn }) => {
      spawn('launchctl', ['bootout', `gui/${process.getuid?.()}/com.cvforge.server`], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    })
    return
  }
  process.exit(0)
}
