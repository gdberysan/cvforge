import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { kitPhase, latestKitFor } from '@/lib/kit/queue'

/**
 * Where an application's background kit stands, for the page that waits on
 * it (components/application/KitProgress). Never a document, only a word.
 */
export async function GET(request: Request) {
  const applicationId = new URL(request.url).searchParams.get('applicationId')
  if (!applicationId) {
    return NextResponse.json(
      { error: 'applicationId is required', code: 'invalid-request' },
      { status: 400 },
    )
  }
  const job = latestKitFor(db, applicationId)
  return NextResponse.json({ state: job ? job.state : 'none', phase: kitPhase(job) })
}
