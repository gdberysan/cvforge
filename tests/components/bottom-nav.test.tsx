// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomNav } from '@/components/ui/BottomNav'

const nav = { path: '/pipeline' }
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }))
afterEach(() => {
  cleanup()
  nav.path = '/pipeline'
})

describe('BottomNav', () => {
  it('offers the three places and marks the one that owns the page', () => {
    render(<BottomNav started />)
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/evidence', '/settings'])
    // Applications open from Today, so Today stays marked on /pipeline.
    expect(links[0].getAttribute('aria-current')).toBe('page')
    expect(links[1].getAttribute('aria-current')).toBeNull()
  })

  it('marks My experience on its own pages and the base CVs', () => {
    nav.path = '/cvs'
    render(<BottomNav started />)
    expect(screen.getAllByRole('link')[1].getAttribute('aria-current')).toBe('page')
  })

  it('before a profile exists, stays out of the first run', () => {
    render(<BottomNav started={false} />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
  it('gives every destination an icon that stays out of its accessible name', () => {
    render(<BottomNav started />)
    for (const link of screen.getAllByRole('link')) {
      const svg = link.querySelector('svg')
      expect(svg?.getAttribute('aria-hidden')).toBe('true')
      expect(link.textContent?.trim().length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/')
  })
})
