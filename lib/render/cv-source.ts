import type { Db } from '@/lib/db/client'
import { getApplication } from '@/lib/db/queries/applications'
import { getVariant } from '@/lib/db/queries/cv-variants'
import type { MessageKey } from '@/lib/i18n'
import { type CVContent, CVContentSchema, type DocumentLanguage } from '@/lib/schemas'

export type CvSource = {
  cv: CVContent
  language: DocumentLanguage
  /** Goes into the filename: the company for an application, the name for a base CV. */
  label: string
  /** Set for an application's CV; the demo keys its pre-rendered PDFs by it. */
  applicationId?: string
}

/**
 * The CV an export request names: `?applicationId=` or `?variantId=`. A
 * failure names a dictionary key, not a sentence: the routes translate it,
 * so a failed download reads in the person's language — the studio shows the
 * message as it comes, and a plain download link shows the response itself.
 */
export function resolveCvSource(
  db: Db,
  params: URLSearchParams,
): { ok: true; source: CvSource } | { ok: false; status: number; error: MessageKey } {
  const variantId = params.get('variantId')
  if (variantId) {
    const variant = getVariant(db, variantId)
    if (!variant) return { ok: false, status: 404, error: 'export.notFound' }
    if (!variant.cv) return { ok: false, status: 409, error: 'export.variantNotComposed' }
    return {
      ok: true,
      source: { cv: variant.cv, language: variant.language, label: variant.name },
    }
  }

  const applicationId = params.get('applicationId')
  if (!applicationId) {
    return { ok: false, status: 400, error: 'export.missingId' }
  }
  const application = getApplication(db, applicationId)
  if (!application) return { ok: false, status: 404, error: 'export.notFound' }
  const parsed = CVContentSchema.safeParse((application.documents as { cv?: unknown } | null)?.cv)
  if (!parsed.success) {
    return { ok: false, status: 409, error: 'export.notComposed' }
  }
  return {
    ok: true,
    source: {
      cv: parsed.data,
      language: application.documentLanguage,
      label: application.company,
      applicationId: application.id,
    },
  }
}

/** An export failure as JSON, in the reader's language, with its key as a stable code. */
export async function exportError(key: MessageKey, status: number): Promise<Response> {
  const { getTranslate } = await import('@/lib/i18n/server')
  const { t } = await getTranslate()
  return Response.json({ error: t(key), code: key }, { status })
}
