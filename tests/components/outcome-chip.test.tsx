// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'

const logOutcomeAction = vi.fn()
vi.mock('@/app/(app)/pipeline/actions', () => ({
  logOutcomeAction: (...a: unknown[]) => logOutcomeAction(...a),
  undoOutcomeAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/ui/toast', () => ({ showToast: vi.fn() }))

const { OutcomeButtons } = await import('@/components/pipeline/OutcomeButtons')
const { OutcomeChip, outcomeTone } = await import('@/components/pipeline/OutcomeChip')

afterEach(() => {
  cleanup()
  logOutcomeAction.mockReset()
})
const es = (ui: ReactNode) => render(<LocaleProvider locale="es">{ui}</LocaleProvider>)

describe('outcome chips', () => {
  it('gives each outcome its tone', () => {
    expect(outcomeTone('applied')).toBe('ok')
    expect(outcomeTone('acknowledged')).toBe('ok')
    expect(outcomeTone('offer')).toBe('ok')
    expect(outcomeTone('screen')).toBe('steel')
    expect(outcomeTone('interview')).toBe('steel')
    expect(outcomeTone('rejected')).toBe('missing')
    expect(outcomeTone('ghosted')).toBe('quiet')
  })

  it('"la envié" is green, with a check drawn, not typed', () => {
    es(<OutcomeChip type="applied" onClick={() => {}} />)
    const chip = screen.getByRole('button', { name: 'la envié' })
    expect(chip.className).toContain('tone-ok')
    expect(chip.querySelector('svg')).toBeTruthy()
    expect(chip.textContent).not.toContain('✓')
  })

  it('a static chip is not a button', () => {
    es(<OutcomeChip type="rejected" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('rechazada').closest('.outcome-chip')?.className).toContain(
      'tone-missing',
    )
  })

  it('a tap logs exactly one outcome, and the chips wait while it is saved', async () => {
    let done: (v: unknown) => void = () => {}
    logOutcomeAction.mockReturnValue(new Promise((r) => (done = r)))
    es(<OutcomeButtons applicationId="a1" status="applied" />)
    fireEvent.click(screen.getByRole('button', { name: 'respondieron' }))
    expect(logOutcomeAction).toHaveBeenCalledWith('a1', 'acknowledged')
    expect(
      (screen.getByRole('button', { name: 'primera llamada' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    done({ ok: true, outcomeId: 'o1' })
  })
})
