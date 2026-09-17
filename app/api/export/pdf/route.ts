import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { renderCvHtml } from '@/lib/render/cv-html'
import { buildFilename, isPdfEngineAvailable, renderPdf } from '@/lib/render/pdf'
import { CVContentSchema } from '@/lib/schemas'

export async function GET(request: Request) {
  const applicationId = new URL(request.url).searchParams.get('applicationId')
  if (!applicationId) {
    return NextResponse.json({ error: 'applicationId is required' }, { status: 400 })
  }

  const application = getApplication(db, applicationId)
  const profile = getProfile(db)
  if (!application || !profile) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const documents = application.documents as { cv?: unknown } | null
  const parsed = CVContentSchema.safeParse(documents?.cv)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'No generated CV for this application yet.' },
      { status: 409 },
    )
  }

  const html = renderCvHtml(parsed.data, {
    language: application.documentLanguage,
  })

  // Demo: Vercel has no Chromium; the PDFs were rendered when the seed was built.
  if (isDemo()) {
    try {
      const file = readFileSync(path.join(process.cwd(), 'demo', 'pdf', `${application.id}.pdf`))
      return new NextResponse(file as unknown as BodyInit, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${buildFilename(profile.basics.fullName, application.company)}"`,
        },
      })
    } catch {
      return NextResponse.json({ error: 'chromium-unavailable', html }, { status: 503 })
    }
  }

  if (!(await isPdfEngineAvailable())) {
    // The UI falls back to window.print() against this same HTML.
    return NextResponse.json({ error: 'chromium-unavailable', html }, { status: 503 })
  }

  const pdf = await renderPdf(html)
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${buildFilename(profile.basics.fullName, application.company)}"`,
    },
  })
}
