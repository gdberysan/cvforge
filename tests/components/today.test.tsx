// tests/components/today.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayInbox } from '@/components/today/TodayInbox'
import { HeroStat } from '@/components/ui/HeroStat'

afterEach(cleanup)

describe('TodayInbox', () => {
  it('gives each card exactly one action, named for its outcome', () => {
    render(
      <TodayInbox
        items={[
          {
            id: 'a',
            title: 'PPC Specialist',
            company: 'Cumbre Ads',
            why: 'Vale la pena',
            href: '/application/a?step=decide',
            action: 'Decidir',
            reason: 'decide',
          },
          {
            id: 'b',
            title: 'Architect',
            company: '',
            why: 'En entrevistas',
            href: '/application/b?step=track',
            action: 'Preparar',
            reason: 'interviewing',
          },
        ]}
      />,
    )
    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    for (const c of cards) expect(c.querySelectorAll('a, button')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /PPC Specialist.*Decidir/ })).toBeTruthy()
  })
})

describe('HeroStat on a fresh install', () => {
  it('shows a dash, never a fake zero', () => {
    render(<HeroStat value="—" label="Aún no hay suficientes postulaciones" delta={null} />)
    expect(screen.queryByText('0%')).toBeNull()
  })
})
