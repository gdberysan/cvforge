import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { getProfile } from '@/lib/db/queries/profile'
import { renderDocx } from '@/lib/render/docx'
import { buildFilename } from '@/lib/render/pdf'
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

  const docx = await renderDocx(parsed.data, { language: application.documentLanguage })
  return new NextResponse(docx as unknown as BodyInit, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${buildFilename(profile.basics.fullName, application.company, 'docx')}"`,
    },
  })
}
