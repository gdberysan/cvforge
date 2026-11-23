'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { hidePerson, saveManualPerson } from '@/lib/db/queries/people'
import { demoBlock, isDemo } from '@/lib/demo/mode'

type Result = { ok: true } | { ok: false; error: string; code: string }

const Person = z.object({
  applicationId: z.string().min(1),
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200),
  role: z.string().trim().max(200),
})

/** His own add or correction: the row becomes manual, and the email agent leaves it alone. */
export async function savePersonAction(input: z.input<typeof Person>): Promise<Result> {
  if (isDemo()) return demoBlock()
  const p = Person.safeParse(input)
  if (!p.success) return { ok: false, error: 'A name is required.', code: 'invalid-request' }
  saveManualPerson(db, p.data.applicationId, p.data)
  revalidatePath(`/application/${p.data.applicationId}`)
  return { ok: true }
}

/** Removed for good: a hidden tombstone keeps a later invite from bringing them back. */
export async function hidePersonAction(input: {
  applicationId: string
  id: string
}): Promise<Result> {
  if (isDemo()) return demoBlock()
  if (!hidePerson(db, String(input.applicationId), String(input.id))) {
    return { ok: false, error: 'Not found.', code: 'not-found' }
  }
  revalidatePath(`/application/${input.applicationId}`)
  return { ok: true }
}
