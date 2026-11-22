/**
 * /api/export/pdf in the browser. The desktop renders PDF bytes with a
 * Chromium it drives (Playwright); a browser cannot drive one, so it always
 * answers as the desktop does when no engine is installed — the CV's own
 * HTML, which the page prints through the browser's dialog (Save as PDF).
 * `printOnly` tells the preview to show that HTML rather than suggest
 * installing an engine.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getProfile } from '@/lib/db/queries/profile'
import { renderCvHtml } from '@/lib/render/cv-html'
import { exportError, resolveCvSource } from '@/lib/render/cv-source'

export async function GET(request: Request) {
  const resolved = resolveCvSource(db, new URL(request.url).searchParams)
  if (!resolved.ok) return exportError(resolved.error, resolved.status)
  if (!getProfile(db)) return exportError('export.noProfile', 404)
  const { cv, language } = resolved.source
  const html = renderCvHtml(cv, { language })
  return NextResponse.json(
    { error: 'chromium-unavailable', html, printOnly: true },
    { status: 503 },
  )
}
