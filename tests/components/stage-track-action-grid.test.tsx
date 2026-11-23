// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'

const logOutcomeAction = vi.fn()
const undoOutcomeAction = vi.fn()
vi.mock('@/app/(app)/pipeline/actions', () => ({
  logOutcomeAction: (...a: unknown[]) => logOutcomeAction(...a),
  undoOutcomeAction: (...a: unknown[]) => undoOutcomeAction(...a),
}))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const showToast = vi.fn()
vi.mock('@/lib/ui/toast', () => ({ showToast: (...a: unknown[]) => showToast(...a) }))

const { StageTrack } = await import('@/components/pipeline/StageTrack')
const { ActionGrid } = await import('@/components/pipeline/ActionGrid')

afterEach(() => {
  cleanup()
  logOutcomeAction.mockReset()
  showToast.mockReset()
})
const view = (locale: 'es' | 'en', ui: ReactNode) =>
  render(<LocaleProvider locale={locale}>{ui}</LocaleProvider>)

describe('StageTrack', () => {
  it('draws four segments filled up to the stage, the current one marked', () => {
    const { container } = view('es', <StageTrack stage="sent" />)
    const track = screen.getByRole('img', { name: 'Etapa: Enviada' })
    expect(track.textContent).toBe('AnalizadaCVEnviadaRespuesta')
    const segs = container.querySelectorAll('.stage-seg')
    expect(segs).toHaveLength(4)
    expect([...segs].map((s) => s.classList.contains('is-done'))).toEqual([true, true, true, false])
    expect(segs[2].classList.contains('is-current')).toBe(true)
    // Every stage carries its icon (shown from 360px up by CSS).
    expect(container.querySelectorAll('.stage-seg > svg')).toHaveLength(4)
  })

  it('an ending takes the last segment, its word and its tone', () => {
    const { container } = view('es', <StageTrack stage="sent" end="rejected" />)
    expect(screen.getByRole('img', { name: 'Etapa: Rechazada' })).toBeTruthy()
    expect(container.querySelector('.stage-track')?.className).toContain('tone-missing')
    const last = container.querySelectorAll('.stage-seg')[3]
    expect(last.classList.contains('is-end')).toBe(true)
    expect(last.textContent).toBe('Rechazada')
  })

  it('speaks English too', () => {
    view('en', <StageTrack stage="reply" end="offer" />)
    expect(screen.getByRole('img', { name: 'Stage: Offer' }).textContent).toBe(
      'AnalyzedCVSentOffer',
    )
  })
})

describe('ActionGrid', () => {
  const four = ['acknowledged', 'screen', 'rejected', 'ghosted'] as const

  it('puts the prompt above four labelled, iconed buttons that answer it', () => {
    view(
      'es',
      <ActionGrid applicationId="a1" actions={four} prompt="9 días sin respuesta. ¿Qué pasó?" />,
    )
    const prompt = screen.getByText('9 días sin respuesta. ¿Qué pasó?')
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Respondieron',
      'Llamada',
      'Rechazada',
      'Sin respuesta',
    ])
    for (const b of buttons) {
      expect(b.querySelector('svg')).toBeTruthy()
      expect(b.getAttribute('aria-describedby')).toBe(prompt.id)
    }
    expect(
      prompt.compareDocumentPosition(buttons[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('a single move is one primary button', () => {
    view('en', <ActionGrid applicationId="a1" actions={['applied']} prompt="Documents ready." />)
    const b = screen.getByRole('button', { name: 'I sent it' })
    expect(b.className).toContain('is-primary')
  })

  it('logs through the existing outcome action, with the undo toast', async () => {
    logOutcomeAction.mockResolvedValue({ ok: true, outcomeId: 'o1', repeated: false })
    view('es', <ActionGrid applicationId="a1" actions={four} prompt="¿Qué pasó?" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Llamada' }))
    })
    expect(logOutcomeAction).toHaveBeenCalledWith('a1', 'screen')
    expect(showToast).toHaveBeenCalledWith('Registrado: primera llamada', expect.any(Function))
  })

  it('a repeat tap says it was already logged, with no undo that would delete the real one', async () => {
    logOutcomeAction.mockResolvedValue({ ok: true, outcomeId: 'o1', repeated: true })
    view('es', <ActionGrid applicationId="a1" actions={four} prompt="¿Qué pasó?" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Llamada' }))
    })
    expect(showToast).toHaveBeenCalledWith('Ya estaba registrado: primera llamada')
    expect(showToast.mock.calls[0]).toHaveLength(1)
  })

  it('shows the error when the log fails', async () => {
    logOutcomeAction.mockResolvedValue({ ok: false, code: 'not-found', error: 'Not found.' })
    view('es', <ActionGrid applicationId="a1" actions={four} prompt="¿Qué pasó?" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rechazada' }))
    })
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('renders nothing without actions', () => {
    const { container } = view('es', <ActionGrid applicationId="a1" actions={[]} prompt="x" />)
    expect(container.textContent).toBe('')
  })
})
