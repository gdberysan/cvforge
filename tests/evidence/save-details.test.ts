import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MasterProfile } from '@/lib/schemas'

let stored: MasterProfile | null = null
const saveProfile = vi.fn((_db: unknown, p: MasterProfile) => {
  stored = p
})
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/profile', () => ({ getProfile: () => stored, saveProfile }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { addWorkAuthorizationAction, saveDetailsAction } = await import(
  '@/app/(app)/evidence/actions'
)

const base = (): MasterProfile =>
  ({
    basics: {
      fullName: 'Ana',
      headline: '',
      email: '',
      location: 'CDMX',
      timezone: 'UTC',
      links: [],
    },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    projects: [],
    workAuthorization: [],
    preferences: { targetTitles: ['PPC Manager'], markets: ['mx'] },
    updatedAt: '2026-11-20T00:00:00.000Z',
  }) as MasterProfile

const valid = {
  location: ' Bogotá, Colombia ',
  timezone: 'America/Bogota',
  markets: ['CO', 'us-remote', 'co'],
  workAuthorization: [{ country: 'Colombia', status: 'Citizen' }],
}

describe('saveDetailsAction', () => {
  beforeEach(() => {
    stored = base()
    saveProfile.mockClear()
  })

  it('saves location, zone, markets (normalised, deduped) and authorization, keeping the rest', async () => {
    expect(await saveDetailsAction(valid)).toEqual({ ok: true })
    const p = stored as MasterProfile
    expect(p.basics).toMatchObject({
      fullName: 'Ana',
      location: 'Bogotá, Colombia',
      timezone: 'America/Bogota',
    })
    expect(p.preferences).toEqual({ targetTitles: ['PPC Manager'], markets: ['co', 'us-remote'] })
    expect(p.workAuthorization).toEqual([{ country: 'Colombia', status: 'Citizen' }])
  })

  it('refuses an unknown zone, an unknown market and an authorization with no country', async () => {
    for (const bad of [
      { ...valid, timezone: 'Mars/Olympus' },
      { ...valid, markets: ['xx'] },
      { ...valid, workAuthorization: [{ country: ' ', status: 'Citizen' }] },
    ]) {
      expect(await saveDetailsAction(bad)).toMatchObject({ ok: false, code: 'invalid-details' })
    }
    expect(saveProfile).not.toHaveBeenCalled()
  })

  it('saves the summary, skills and target titles you write, trimmed and deduped', async () => {
    expect(
      await saveDetailsAction({
        ...valid,
        summary: '  Paid media lead with eight years in marketplaces.  ',
        skills: [
          { category: 'Paid media', items: ['Google Ads', 'Meta Ads'] },
          { category: 'Empty', items: [] },
        ],
        targetTitles: ['PPC Manager', 'Paid Media Lead', 'PPC Manager'],
      }),
    ).toEqual({ ok: true })
    const p = stored as MasterProfile
    expect(p.summary).toBe('Paid media lead with eight years in marketplaces.')
    // A group with no skills is not a group.
    expect(p.skills).toEqual([{ category: 'Paid media', items: ['Google Ads', 'Meta Ads'] }])
    expect(p.preferences.targetTitles).toEqual(['PPC Manager', 'Paid Media Lead'])
  })

  it('a save that leaves them out keeps the summary, skills and titles as they were', async () => {
    stored = { ...base(), summary: 'Kept.', skills: [{ category: 'A', items: ['b'] }] }
    expect(await saveDetailsAction(valid)).toEqual({ ok: true })
    const p = stored as MasterProfile
    expect(p.summary).toBe('Kept.')
    expect(p.skills).toEqual([{ category: 'A', items: ['b'] }])
    expect(p.preferences.targetTitles).toEqual(['PPC Manager'])
  })
})

// 2026-11-24: a US CV silent on authorization came out "not eligible" for
// every posting that required it. The person is asked; their yes is saved.
describe('addWorkAuthorizationAction', () => {
  beforeEach(() => {
    stored = base()
    saveProfile.mockClear()
  })

  it('adds the answer once, keeping the rest of the record', async () => {
    const yes = { country: 'Estados Unidos', status: 'Con permiso para trabajar' }
    expect(await addWorkAuthorizationAction(yes)).toEqual({ ok: true })
    expect(await addWorkAuthorizationAction({ ...yes, country: ' estados unidos ' })).toEqual({
      ok: true,
    })
    const p = stored as MasterProfile
    expect(p.workAuthorization).toEqual([yes])
    expect(p.basics.location).toBe('CDMX')
    expect(saveProfile).toHaveBeenCalledTimes(1)
  })

  it('refuses an empty country', async () => {
    expect(await addWorkAuthorizationAction({ country: ' ', status: 'x' })).toMatchObject({
      ok: false,
    })
  })
})
