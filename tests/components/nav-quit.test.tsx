// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Nav } from '@/components/ui/Nav'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ refresh() {} }) }))
afterEach(cleanup)

describe('Nav quit', () => {
  it('offers quit on the Mac itself', () => {
    render(<Nav started canQuit />)
    expect(screen.getByRole('button', { name: /quit|apagar|salir/i })).toBeTruthy()
  })
  it('hides quit from a phone, where the server refuses it anyway', () => {
    render(<Nav started canQuit={false} />)
    expect(screen.queryByRole('button', { name: /quit|apagar|salir/i })).toBeNull()
  })
})
