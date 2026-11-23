import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { renderCvHtml } from '@/lib/render/cv-html'
import { exportError, resolveCvSource } from '@/lib/render/cv-source'
import { buildFilename, isPdfEngineAvailable, renderPdf } from '@/lib/render/pdf'

export async function GET(request: Request) {
  const resolved = resolveCvSource(db, new URL(request.url).searchParams)
  if (!resolved.ok) return exportError(resolved.error, resolved.status)
  const profile = getProfile(db)
  if (!profile) return exportError('export.noProfile', 404)

  const { cv, language, label, applicationId } = resolved.source
  const html = renderCvHtml(cv, { language })
  const disposition = `attachment; filename="${buildFilename(profile.basics.fullName, label)}"`

  // Demo: Vercel has no Chromium; the PDFs were rendered when the seed was built.
  if (isDemo()) {
    try {
      const file = readFileSync(path.join(process.cwd(), 'demo', 'pdf', `${applicationId}.pdf`))
      return new NextResponse(file as unknown as BodyInit, {
        headers: { 'content-type': 'application/pdf', 'content-disposition': disposition },
      })
    } catch {
      return NextResponse.json({ error: 'chromium-unavailable', html }, { status: 503 })
    }
  }

  if (!(await isPdfEngineAvailable())) {
    // The UI falls back to window.print() against this same HTML.
    return NextResponse.json({ error: 'chromium-unavailable', html }, { status: 503 })
  }

  let pdf: Buffer
  try {
    pdf = await renderPdf(html)
  } catch {
    // A hung or crashed browser: say so in words, not Next's error page.
    return exportError('export.renderFailed', 500)
  }
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: { 'content-type': 'application/pdf', 'content-disposition': disposition },
  })
}
