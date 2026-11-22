import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('offline page', () => {
  it('speaks to every install, not only a Tailscale one', () => {
    const html = readFileSync('public/offline.html', 'utf8')
    expect(html).not.toMatch(/tailscale/i)
  })
})
