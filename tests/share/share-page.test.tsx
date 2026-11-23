import { describe, expect, it, vi } from 'vitest'

const fetchLinkedInDetail = vi.fn()
const redirect = vi.fn()
const links: { id: string; sourceUrl: string }[] = []
vi.mock('#discover', () => ({ fetchLinkedInDetail, isDiscoverEnabled: () => true }))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/queries/profile', () => ({ getProfile: () => null }))
vi.mock('@/lib/db/queries/applications', () => ({ listApplicationLinks: () => links }))
vi.mock('@/lib/i18n/server', () => ({ getTranslate: async () => ({ t: (k: string) => k }) }))
vi.mock('next/navigation', () => ({ redirect }))

const { default: SharePage } = await import('@/app/(app)/share/page')
const shared = { url: 'https://www.linkedin.com/jobs/view/4012345678/' }

describe('/share', () => {
  it('renders a LinkedIn share without fetching LinkedIn', async () => {
    await SharePage({ searchParams: Promise.resolve(shared) })
    expect(fetchLinkedInDetail).not.toHaveBeenCalled()
  })

  it('a posting already analysed redirects on the server, still without fetching', async () => {
    links.push({ id: 'app_1', sourceUrl: shared.url })
    await SharePage({ searchParams: Promise.resolve(shared) })
    expect(redirect).toHaveBeenCalledWith('/application/app_1')
    expect(fetchLinkedInDetail).not.toHaveBeenCalled()
  })
})
