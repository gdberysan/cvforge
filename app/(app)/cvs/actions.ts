'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { getApplication, saveDocuments } from '@/lib/db/queries/applications'
import { deleteVariant, getVariant } from '@/lib/db/queries/cv-variants'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { getLocale } from '@/lib/i18n/server'
import type { CVContent, GroundingReport } from '@/lib/schemas'
import { verifyVariantFor } from '@/lib/variants'

type Failure = { ok: false; error: string; code: string }

export async function deleteVariantAction(id: string): Promise<{ ok: true } | Failure> {
  if (isDemo()) return demoBlock()
  deleteVariant(db, id)
  revalidatePath('/cvs')
  return { ok: true }
}

/**
 * Uses a base CV as this application's CV — free unless the evidence changed
 * since it was composed, which costs one small re-verification. It is copied, not
 * linked: recomposing the base CV later must not rewrite what was already sent.
 */
export async function applyVariantAction(
  applicationId: string,
  variantId: string,
): Promise<{ ok: true; cv: CVContent; report: GroundingReport } | Failure> {
  if (isDemo()) return demoBlock()
  const application = getApplication(db, applicationId)
  const variant = getVariant(db, variantId)
  const profile = getProfile(db)
  if (!application || !profile) return { ok: false, error: 'Not found', code: 'not-found' }
  if (!variant?.cv) return { ok: false, error: 'Not found', code: 'variant-not-found' }
  if (variant.language !== application.documentLanguage) {
    return { ok: false, error: 'Language mismatch', code: 'variant-language' }
  }

  const report = await verifyVariantFor({
    cv: variant.cv,
    name: variant.name,
    market: variant.market,
    composedReport: variant.report,
    composedEvidenceHash: variant.evidenceHash,
    reasonLanguage: await getLocale(),
    profile,
    evidence: listEvidence(db),
    requirements: application.requirements,
    mappings: application.mappings,
  })
  saveDocuments(db, applicationId, { cv: variant.cv }, report)
  revalidatePath(`/application/${applicationId}`)
  return { ok: true, cv: variant.cv, report }
}
