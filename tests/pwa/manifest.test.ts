import { describe, expect, it } from 'vitest'
import manifest from '@/app/manifest'

describe('web app manifest', () => {
  const m = manifest()

  it('installs as a standalone app with a maskable icon', () => {
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.icons?.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true)
  })

  it('receives shared postings at /share by GET', () => {
    expect(m.share_target).toEqual({
      action: '/share',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    })
  })
})
