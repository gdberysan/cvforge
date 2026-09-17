import { randomUUID } from 'node:crypto'
import type { MasterProfile } from '@/lib/schemas'

export type NewRole = {
  title: string
  company: string
  /** YYYY-MM */
  start: string
  /** YYYY-MM; absent means the role is current. */
  end?: string
}

/**
 * Manual entry, as the design promises: a CV is a snapshot, and the newest
 * role is exactly what an imported PDF lacks. The id is random-suffixed so it
 * can never collide with import's sequential exp_N ids — or with a future
 * re-import's.
 */
export function addRole(
  profile: MasterProfile,
  role: NewRole,
): { profile: MasterProfile; roleId: string } {
  const roleId = `exp_${randomUUID().slice(0, 8)}`
  return {
    roleId,
    profile: {
      ...profile,
      experience: [
        ...profile.experience,
        {
          id: roleId,
          title: role.title,
          company: role.company,
          period: { start: role.start, ...(role.end ? { end: role.end } : {}) },
          summary: '',
        },
      ],
    },
  }
}

/**
 * Rewrites a role's stated facts. Facts flow verbatim into every generated
 * CV, so a typo here is a typo on paper — editability is part of grounding,
 * not cosmetics. Returns null when the role does not exist.
 */
export function updateRole(
  profile: MasterProfile,
  roleId: string,
  role: NewRole,
): MasterProfile | null {
  if (!profile.experience.some((r) => r.id === roleId)) return null
  return {
    ...profile,
    experience: profile.experience.map((r) =>
      r.id === roleId
        ? {
            ...r,
            title: role.title,
            company: role.company,
            period: { start: role.start, ...(role.end ? { end: role.end } : {}) },
          }
        : r,
    ),
  }
}

/** Removes a role. Its evidence rows are the caller's responsibility. */
export function removeRole(profile: MasterProfile, roleId: string): MasterProfile | null {
  if (!profile.experience.some((r) => r.id === roleId)) return null
  return {
    ...profile,
    experience: profile.experience.filter((r) => r.id !== roleId),
  }
}
