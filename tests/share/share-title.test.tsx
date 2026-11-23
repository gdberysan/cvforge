import { describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@/lib/i18n'

vi.mock('#discover', () => ({ fetchLinkedInDetail: vi.fn(), isDiscoverEnabled: () => true }))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/profile', () => ({ getProfile: () => null }))
vi.mock('@/lib/db/queries/applications', () => ({ listApplicationLinks: () => [] }))
vi.mock('@/lib/i18n/server', () => ({ getTranslate: async () => ({ t: makeTranslate('es') }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { default: SharePage } = await import('@/app/(app)/share/page')

/** The h1's text, read off the rendered element tree. */
function h1Of(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (el.type === 'h1') return String(el.props?.children)
  const kids = el.props?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) {
    const found = h1Of(k)
    if (found) return found
  }
  return null
}

describe('Analizar', () => {
  it('opens with a title that says what the page is for', async () => {
    const ui = await SharePage({ searchParams: Promise.resolve({}) })
    expect(h1Of(ui)).toBe('Analiza una vacante')
  })
  it('arriving from a share, the title points at that posting', async () => {
    const ui = await SharePage({
      searchParams: Promise.resolve({ text: 'x'.repeat(120) }),
    })
    expect(h1Of(ui)).toBe('Analiza esta vacante')
  })
})
