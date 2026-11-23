import { describe, expect, it, vi } from 'vitest'

const setArchived = vi.fn()
const dismissJob = vi.fn()
const getApplication = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/applications', () => ({ setArchived, getApplication }))
vi.mock('@/lib/db/queries/discover', () => ({ dismissJob }))

const { skipApplicationAction } = await import('@/app/(app)/triage/actions')

describe('skipApplicationAction', () => {
  it('records a skipped LinkedIn posting as dismissed, so the satellite never brings it back', async () => {
    getApplication.mockReturnValue({ sourceUrl: 'https://www.linkedin.com/jobs/view/4012345678/' })
    await skipApplicationAction('app_1')
    expect(setArchived).toHaveBeenCalledWith({}, 'app_1', true)
    expect(dismissJob).toHaveBeenCalledWith({}, '4012345678')
  })

  it('leaves dismissed jobs alone for a posting from anywhere else', async () => {
    dismissJob.mockClear()
    getApplication.mockReturnValue({ sourceUrl: 'https://jobs.lever.co/acme/1' })
    await skipApplicationAction('app_2')
    expect(dismissJob).not.toHaveBeenCalled()
  })
})
