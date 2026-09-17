import { describe, expect, it } from 'vitest'
import { addRole, removeRole, updateRole } from '@/lib/roles'
import { MasterProfileSchema } from '@/lib/schemas'

const profile = MasterProfileSchema.parse({
  basics: { fullName: 'Ana Torres', email: '' },
  experience: [
    { id: 'exp_1', title: 'Engineer', company: 'Kavak', period: { start: '2021-03' }, summary: '' },
  ],
  preferences: { targetTitles: [], markets: [] },
  updatedAt: '2026-08-09T00:00:00.000Z',
})

describe('addRole', () => {
  it('appends the role with the stated facts and returns its id', () => {
    const { profile: next, roleId } = addRole(profile, {
      title: 'Automation Lead',
      company: 'Northwind',
      start: '2024-01',
      end: '2026-08',
    })

    const added = next.experience.at(-1)
    expect(added?.id).toBe(roleId)
    expect(added?.title).toBe('Automation Lead')
    expect(added?.company).toBe('Northwind')
    expect(added?.period).toEqual({ start: '2024-01', end: '2026-08' })
    expect(MasterProfileSchema.safeParse(next).success).toBe(true)
  })

  it('leaves the period open-ended when no end is given — a current role', () => {
    const { profile: next } = addRole(profile, {
      title: 'Lead',
      company: 'Acme',
      start: '2026-01',
    })
    expect(next.experience.at(-1)?.period).toEqual({ start: '2026-01' })
  })

  it('never reuses an existing role id — a future import must not collide', () => {
    const { roleId } = addRole(profile, { title: 'Lead', company: 'Acme', start: '2026-01' })
    expect(roleId).toMatch(/^exp_/)
    expect(profile.experience.some((r) => r.id === roleId)).toBe(false)
    // Import assigns exp_1, exp_2… — a manual id must live outside that range.
    expect(roleId).not.toMatch(/^exp_\d+$/)
  })

  it('does not mutate the profile it was given', () => {
    const before = profile.experience.length
    addRole(profile, { title: 'Lead', company: 'Acme', start: '2026-01' })
    expect(profile.experience.length).toBe(before)
  })
})

describe('updateRole', () => {
  it('rewrites the stated facts on the named role only', () => {
    const next = updateRole(profile, 'exp_1', {
      title: 'Senior Engineer',
      company: 'Kavak',
      start: '2021-04',
      end: '2024-06',
    })
    expect(next?.experience[0]).toMatchObject({
      id: 'exp_1',
      title: 'Senior Engineer',
      period: { start: '2021-04', end: '2024-06' },
    })
    expect(MasterProfileSchema.safeParse(next).success).toBe(true)
  })

  it('can reopen a closed role by clearing its end date', () => {
    const next = updateRole(profile, 'exp_1', {
      title: 'Engineer',
      company: 'Kavak',
      start: '2021-03',
    })
    expect(next?.experience[0].period).toEqual({ start: '2021-03' })
  })

  it('returns null for a role that does not exist', () => {
    expect(
      updateRole(profile, 'exp_nope', { title: 'X', company: 'Y', start: '2020-01' }),
    ).toBeNull()
  })
})

describe('removeRole', () => {
  it('removes the role and leaves the rest untouched', () => {
    const { profile: withTwo, roleId } = addRole(profile, {
      title: 'Lead',
      company: 'Acme',
      start: '2026-01',
    })
    const next = removeRole(withTwo, 'exp_1')
    expect(next?.experience.map((r) => r.id)).toEqual([roleId])
    expect(MasterProfileSchema.safeParse(next).success).toBe(true)
  })

  it('returns null for a role that does not exist', () => {
    expect(removeRole(profile, 'exp_nope')).toBeNull()
  })
})
