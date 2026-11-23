'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { deleteEvidence, listEvidence, upsertEvidence } from '@/lib/db/queries/evidence'
import { deleteInterviewSessions } from '@/lib/db/queries/interview-sessions'
import { getProfile, saveProfile } from '@/lib/db/queries/profile'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { MarketSchema } from '@/lib/markets'
import { addProject, removeProject, updateProject } from '@/lib/projects'
import { addRole, removeRole, updateRole } from '@/lib/roles'
import { type EvidenceItem, EvidenceItemSchema } from '@/lib/schemas'
import { safeZone } from '@/lib/time'

type Result = { ok: true } | { ok: false; error: string }

const NewRoleSchema = z.object({
  title: z.string().trim().min(1),
  company: z.string().trim().min(1),
  start: z.string().regex(/^\d{4}-\d{2}$/),
  end: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
})

/**
 * Manual entry for the role an imported CV missed. Returns the new role's id
 * so the client can land straight in its interview — the same grounding path
 * every other role takes.
 */
export async function addRoleAction(
  input: unknown,
): Promise<{ ok: true; roleId: string } | { ok: false; error: string; code: string }> {
  if (isDemo()) return demoBlock()
  const parsed = NewRoleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the role fields.', code: 'invalid-role' }
  }
  const profile = getProfile(db)
  if (!profile) {
    return { ok: false, error: 'Build your evidence base first.', code: 'no-profile' }
  }

  const { profile: next, roleId } = addRole(profile, parsed.data)
  saveProfile(db, { ...next, updatedAt: new Date().toISOString() })
  revalidatePath('/evidence')
  return { ok: true, roleId }
}

type RoleResult = { ok: true } | { ok: false; error: string; code: string }

/**
 * Role facts flow verbatim into every generated CV — a typo here would be a
 * typo on paper, so they must be correctable without a re-import.
 */
export async function updateRoleAction(roleId: string, input: unknown): Promise<RoleResult> {
  if (isDemo()) return demoBlock()
  const parsed = NewRoleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the role fields.', code: 'invalid-role' }
  }
  const profile = getProfile(db)
  const next = profile && updateRole(profile, roleId, parsed.data)
  if (!next) {
    return { ok: false, error: 'That role no longer exists.', code: 'role-not-found' }
  }

  saveProfile(db, { ...next, updatedAt: new Date().toISOString() })
  revalidatePath('/evidence')
  return { ok: true }
}

/**
 * Deletes a role AND its evidence — all origins, interviewed included, which
 * is why the UI arms this behind an explicit second click naming the count.
 */
export async function deleteRoleAction(roleId: string): Promise<RoleResult> {
  if (isDemo()) return demoBlock()
  const profile = getProfile(db)
  const next = profile && removeRole(profile, roleId)
  if (!next) {
    return { ok: false, error: 'That role no longer exists.', code: 'role-not-found' }
  }

  // One transaction: a crash between the profile write and the evidence
  // loop used to leave records citing a role that no longer existed. The
  // role's interview sessions go too — nothing displays them once the role
  // is gone, but they shipped in every backup forever.
  db.transaction((tx) => {
    saveProfile(tx, { ...next, updatedAt: new Date().toISOString() })
    for (const item of listEvidence(tx)) {
      if (item.sourceRef.type === 'experience' && item.sourceRef.id === roleId) {
        deleteEvidence(tx, item.id)
      }
    }
    deleteInterviewSessions(tx, roleId)
  })
  revalidatePath('/evidence')
  return { ok: true }
}

const MONTH = /^\d{4}-\d{2}$/

const NewProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(''),
  url: z.string().trim().optional(),
  stack: z.array(z.string().trim().min(1)).default([]),
  start: z.string().regex(MONTH),
  end: z.string().regex(MONTH).optional(),
})

/**
 * Self-built work gets its own record instead of an invented employer.
 * Returns the id so the client can scroll to the new project's section.
 */
export async function addProjectAction(
  input: unknown,
): Promise<{ ok: true; projectId: string } | { ok: false; error: string; code: string }> {
  if (isDemo()) return demoBlock()
  const parsed = NewProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the project fields.', code: 'invalid-project' }
  }
  const profile = getProfile(db)
  if (!profile) {
    return { ok: false, error: 'Build your evidence base first.', code: 'no-profile' }
  }

  const { profile: next, projectId } = addProject(profile, parsed.data)
  saveProfile(db, { ...next, updatedAt: new Date().toISOString() })
  revalidatePath('/evidence')
  return { ok: true, projectId }
}

export async function updateProjectAction(projectId: string, input: unknown): Promise<RoleResult> {
  if (isDemo()) return demoBlock()
  const parsed = NewProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the project fields.', code: 'invalid-project' }
  }
  const profile = getProfile(db)
  const next = profile && updateProject(profile, projectId, parsed.data)
  if (!next) {
    return { ok: false, error: 'That project no longer exists.', code: 'project-not-found' }
  }

  saveProfile(db, { ...next, updatedAt: new Date().toISOString() })
  revalidatePath('/evidence')
  return { ok: true }
}

/** Deletes a project AND its evidence, in one transaction — same rule as a role. */
export async function deleteProjectAction(projectId: string): Promise<RoleResult> {
  if (isDemo()) return demoBlock()
  const profile = getProfile(db)
  const next = profile && removeProject(profile, projectId)
  if (!next) {
    return { ok: false, error: 'That project no longer exists.', code: 'project-not-found' }
  }

  db.transaction((tx) => {
    saveProfile(tx, { ...next, updatedAt: new Date().toISOString() })
    for (const item of listEvidence(tx)) {
      if (item.sourceRef.type === 'project' && item.sourceRef.id === projectId) {
        deleteEvidence(tx, item.id)
      }
    }
  })
  revalidatePath('/evidence')
  return { ok: true }
}

export async function upsertEvidenceAction(
  input: EvidenceItem,
  sortOrder?: number,
): Promise<Result> {
  if (isDemo()) return demoBlock()
  const parsed = EvidenceItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid evidence' }
  }
  upsertEvidence(db, parsed.data, sortOrder)
  revalidatePath('/evidence')
  return { ok: true }
}

/** On success carries the deleted row's position, so undo restores it there. */
type DeleteResult = { ok: true; sortOrder: number | null } | { ok: false; error: string }

export async function deleteEvidenceAction(id: string): Promise<DeleteResult> {
  if (isDemo()) return demoBlock()
  const sortOrder = deleteEvidence(db, id)
  revalidatePath('/evidence')
  return { ok: true, sortOrder }
}

const DetailsSchema = z.object({
  location: z.string().trim().max(120),
  timezone: z
    .string()
    .trim()
    .refine((zone) => zone !== '' && safeZone(zone) === zone, 'unknown time zone'),
  markets: z
    .array(MarketSchema)
    .max(8)
    .transform((list) => [...new Set(list)]),
  workAuthorization: z
    .array(
      z.object({ country: z.string().trim().min(1).max(80), status: z.string().trim().max(120) }),
    )
    .max(10),
  // What only you can say, and until 2026-11-21 only a CV import could set:
  // the summary a CV is rewritten from, your skill groups, and the titles
  // you aim at. Optional, so a save that does not touch them keeps them.
  summary: z.string().trim().max(1500).optional(),
  skills: z
    .array(
      z.object({
        category: z.string().trim().max(60),
        items: z.array(z.string().trim().min(1).max(60)).max(40),
      }),
    )
    .max(20)
    .optional(),
  targetTitles: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
})

/**
 * The facts a posting's location, timezone and authorization lines are
 * judged against, and the markets a CV can aim at. Until 2026-11 only a CV
 * import could set them, and the time zone was always Mexico City's.
 */
export async function saveDetailsAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  if (isDemo()) return demoBlock()
  const parsed = DetailsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check your details.', code: 'invalid-details' }
  const profile = getProfile(db)
  if (!profile) return { ok: false, error: 'No profile yet.', code: 'no-profile' }
  const d = parsed.data
  saveProfile(db, {
    ...profile,
    basics: { ...profile.basics, location: d.location, timezone: d.timezone },
    workAuthorization: d.workAuthorization,
    ...(d.summary !== undefined ? { summary: d.summary } : {}),
    ...(d.skills !== undefined ? { skills: d.skills.filter((g) => g.items.length > 0) } : {}),
    preferences: {
      ...profile.preferences,
      markets: d.markets,
      ...(d.targetTitles !== undefined ? { targetTitles: [...new Set(d.targetTitles)] } : {}),
    },
    updatedAt: new Date().toISOString(),
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}
