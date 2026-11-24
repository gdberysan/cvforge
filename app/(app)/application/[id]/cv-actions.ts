'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { applyCvPatch, type CvPatch, checkEditedCv } from '@/lib/ai/edit-cv'
import { db } from '@/lib/db/client'
import { getApplication, saveDocuments } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import {
  type CVContent,
  CVContentSchema,
  type GroundingReport,
  GroundingReportSchema,
} from '@/lib/schemas'

/**
 * Editing a written CV by hand (lib/ai/edit-cv.ts): check an edit as it is
 * typed, and save it. Only text moves; no model is called.
 */
const Patch = z.object({
  summary: z.string().max(2000).optional(),
  bullets: z.record(z.string().max(80), z.string().max(2000).nullable()).optional(),
  skills: z
    .array(z.object({ category: z.string().max(200), items: z.array(z.string().max(300)).max(60) }))
    .max(20)
    .optional(),
})

type Result =
  | { ok: true; cv: CVContent; report: GroundingReport; edited: string[] }
  | { ok: false; error: string; code: 'invalid-request' | 'not-found' | 'no-cv' | 'demo-read-only' }

function edit(applicationId: unknown, patch: unknown) {
  const parsed = Patch.safeParse(patch)
  if (typeof applicationId !== 'string' || !applicationId || !parsed.success) {
    return {
      error: { ok: false as const, error: 'Invalid request.', code: 'invalid-request' as const },
    }
  }
  const application = getApplication(db, applicationId)
  const profile = getProfile(db)
  if (!application || !profile) {
    return { error: { ok: false as const, error: 'Not found.', code: 'not-found' as const } }
  }
  const documents = application.documents as Record<string, unknown> | null
  const saved = CVContentSchema.safeParse(documents?.cv)
  if (!saved.success) {
    return {
      error: { ok: false as const, error: 'There is no CV to edit.', code: 'no-cv' as const },
    }
  }
  const savedReport = GroundingReportSchema.safeParse(application.groundingReport)
  const cv = applyCvPatch(saved.data, parsed.data as CvPatch)
  const checked = checkEditedCv({
    saved: saved.data,
    savedReport: savedReport.success ? savedReport.data : null,
    edited: cv,
    profile,
    evidence: listEvidence(db),
    requirements: application.requirements,
    mappings: application.mappings,
    jobTitle: application.jobTitle,
    market: application.market,
  })
  return { application, cv, report: checked.report, edited: checked.edited }
}

/** The code checks on an edit in progress; nothing is saved. */
export async function checkCvEditAction(applicationId: string, patch: CvPatch): Promise<Result> {
  if (isDemo()) return demoBlock()
  const out = edit(applicationId, patch)
  if ('error' in out && out.error) return out.error
  return { ok: true, cv: out.cv, report: out.report, edited: out.edited }
}

/** Saves an edit with its checks; the PDF is rebuilt from it. */
export async function saveCvEditAction(applicationId: string, patch: CvPatch): Promise<Result> {
  if (isDemo()) return demoBlock()
  const out = edit(applicationId, patch)
  if ('error' in out && out.error) return out.error
  saveDocuments(db, out.application.id, { cv: out.cv }, out.report)
  revalidatePath(`/application/${out.application.id}`)
  return { ok: true, cv: out.cv, report: out.report, edited: out.edited }
}
