'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { appendOutcome, getApplication } from '@/lib/db/queries/applications'
import { demoBlock, isDemo } from '@/lib/demo/mode'

const OutcomeType = z.enum([
  'applied',
  'acknowledged',
  'screen',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'ghosted',
])

type Result = { ok: true } | { ok: false; error: string; code: string }

/**
 * One click, one outcome event. The whole outcomes layer is worthless if
 * logging decays, so this is the cheapest write in the product: no form, no
 * dialog, the timestamp is now.
 */
export async function logOutcomeAction(applicationId: string, type: string): Promise<Result> {
  if (isDemo()) return demoBlock()
  const parsed = OutcomeType.safeParse(type)
  if (!parsed.success) {
    return { ok: false, error: 'Unknown outcome.', code: 'invalid-request' }
  }
  if (!getApplication(db, applicationId)) {
    return { ok: false, error: 'Not found.', code: 'role-not-found' }
  }

  appendOutcome(db, applicationId, { at: new Date().toISOString(), type: parsed.data })
  revalidatePath('/pipeline')
  revalidatePath('/')
  revalidatePath(`/application/${applicationId}`)
  return { ok: true }
}
