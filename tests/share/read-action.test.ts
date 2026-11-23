import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchLinkedInDetail = vi.fn()
const enabled = { value: true }
vi.mock('#discover', () => ({
  fetchLinkedInDetail,
  isDiscoverEnabled: () => enabled.value,
}))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/profile', () => ({
  getProfile: () => ({ basics: { location: '' }, preferences: { markets: ['mx'] } }),
}))
const demo = { value: false }
vi.mock('@/lib/demo/mode', () => ({
  isDemo: () => demo.value,
  demoBlock: () => ({ ok: false, error: 'demo', code: 'demo-read-only' }),
}))

const { readLinkedInPostingAction } = await import('@/app/(app)/share/actions')

describe('readLinkedInPostingAction', () => {
  beforeEach(() => {
    fetchLinkedInDetail.mockReset()
    enabled.value = true
    demo.value = false
  })

  it('the demo never reads LinkedIn', async () => {
    demo.value = true
    expect(await readLinkedInPostingAction('4012345678')).toMatchObject({ ok: false })
    expect(fetchLinkedInDetail).not.toHaveBeenCalled()
  })

  it('reads the posting once and returns its text and market', async () => {
    fetchLinkedInDetail.mockResolvedValue({
      title: 'Growth Lead',
      company: 'Acme',
      location: 'Ciudad de México',
      description: 'Do growth.',
    })
    const r = await readLinkedInPostingAction('4012345678')
    expect(r).toMatchObject({ status: 'ok', market: 'mx' })
    expect('status' in r && r.status === 'ok' && r.text).toContain('Do growth.')
    expect(fetchLinkedInDetail).toHaveBeenCalledOnce()
  })

  it('refuses an id that is not a LinkedIn job id, without fetching', async () => {
    expect(await readLinkedInPostingAction('../../etc')).toEqual({ status: 'failed' })
    expect(fetchLinkedInDetail).not.toHaveBeenCalled()
  })

  it('refuses when this build has no reader', async () => {
    enabled.value = false
    expect(await readLinkedInPostingAction('4012345678')).toEqual({ status: 'off' })
    expect(fetchLinkedInDetail).not.toHaveBeenCalled()
  })

  it('reports an empty posting and a failed fetch', async () => {
    fetchLinkedInDetail.mockResolvedValueOnce({ title: 'X', description: '' })
    expect(await readLinkedInPostingAction('4012345678')).toEqual({ status: 'empty' })
    fetchLinkedInDetail.mockRejectedValueOnce(new Error('timeout'))
    expect(await readLinkedInPostingAction('4012345678')).toEqual({ status: 'failed' })
  })
})
