import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getProfile } from '@/lib/db/queries/profile'
import { exportError, resolveCvSource } from '@/lib/render/cv-source'
import { renderDocx } from '@/lib/render/docx'
import { buildFilename } from '@/lib/render/filename'

export async function GET(request: Request) {
  const resolved = resolveCvSource(db, new URL(request.url).searchParams)
  if (!resolved.ok) return exportError(resolved.error, resolved.status)
  const profile = getProfile(db)
  if (!profile) return exportError('export.noProfile', 404)

  const { cv, language, label } = resolved.source
  const docx = await renderDocx(cv, { language })
  return new NextResponse(docx as unknown as BodyInit, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${buildFilename(profile.basics.fullName, label, 'docx')}"`,
    },
  })
}
