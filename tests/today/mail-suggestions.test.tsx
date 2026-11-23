// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { type MailCard, MailSuggestions } from '@/components/today/MailSuggestions'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const accept = vi.fn()
const dismiss = vi.fn()
vi.mock('@/app/(app)/agent/actions', () => ({
  acceptMailSuggestionAction: (...a: unknown[]) => accept(...a),
  dismissMailSuggestionAction: (...a: unknown[]) => dismiss(...a),
}))
const showToast = vi.fn()
vi.mock('@/lib/ui/toast', () => ({ showToast: (...a: unknown[]) => showToast(...a) }))

beforeEach(() => {
  accept.mockReset()
  dismiss.mockReset()
  showToast.mockClear()
})
afterEach(cleanup)

const view = (locale: 'es' | 'en', ui: ReactNode) =>
  render(<LocaleProvider locale={locale}>{ui}</LocaleProvider>)
const card = (over: Partial<MailCard> = {}): MailCard => ({
  id: 's1',
  at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  from: 'Talent <talent@acme.com>',
  subject: 'Re: tu postulación',
  quote: 'Seguimos con otros perfiles.',
  candidates: [
    { id: 'a1', label: 'Growth Lead · Acme' },
    { id: 'a2', label: 'CRM Manager · Acme' },
  ],
  ...over,
})
const waiting = [
  { id: 'a1', label: 'Growth Lead · Acme' },
  { id: 'a9', label: 'PM · Globex' },
]
const click = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el)
  })
}

describe('MailSuggestions', () => {
  it('shows subject, sender, quote, a chip per candidate and the five outcomes', () => {
    view('es', <MailSuggestions cards={[card()]} waiting={waiting} />)
    expect(screen.getByRole('heading', { name: 'De tu correo' })).toBeTruthy()
    const art = screen.getByRole('article')
    expect(art.textContent).toMatch('Re: tu postulación')
    expect(art.textContent).toMatch('Talent <talent@acme.com>')
    expect(art.textContent).toMatch('Seguimos con otros perfiles.')
    expect(screen.getByRole('button', { name: 'Growth Lead · Acme' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'CRM Manager · Acme' })).toBeTruthy()
    for (const name of ['respondieron', 'primera llamada', 'entrevista', 'rechazada', 'oferta']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeTruthy()
  })

  it('outcomes wait for an application when several candidates are possible', async () => {
    accept.mockResolvedValue({ ok: true })
    view('es', <MailSuggestions cards={[card()]} waiting={waiting} />)
    const rejected = screen.getByRole('button', { name: 'rechazada' }) as HTMLButtonElement
    expect(rejected.disabled).toBe(true)
    await click(screen.getByRole('button', { name: 'CRM Manager · Acme' }))
    expect(rejected.disabled).toBe(false)
    await click(rejected)
    expect(accept).toHaveBeenCalledWith('s1', 'a2', 'rejected')
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(refresh).toHaveBeenCalled()
  })

  it('a single candidate is already chosen', async () => {
    accept.mockResolvedValue({ ok: true })
    view(
      'en',
      <MailSuggestions
        cards={[card({ candidates: [{ id: 'a1', label: 'Growth Lead · Acme' }] })]}
        waiting={waiting}
      />,
    )
    await click(screen.getByRole('button', { name: 'interview' }))
    expect(accept).toHaveBeenCalledWith('s1', 'a1', 'interview')
  })

  it('with no candidates it offers a select over the waiting applications', async () => {
    accept.mockResolvedValue({ ok: true })
    view('es', <MailSuggestions cards={[card({ candidates: [] })]} waiting={waiting} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Elige una postulación…',
      'Growth Lead · Acme',
      'PM · Globex',
    ])
    await act(async () => {
      fireEvent.change(select, { target: { value: 'a9' } })
    })
    await click(screen.getByRole('button', { name: 'oferta' }))
    expect(accept).toHaveBeenCalledWith('s1', 'a9', 'offer')
  })

  it('Descartar closes the card; a refusal keeps it and says why', async () => {
    dismiss.mockResolvedValueOnce({ ok: false, code: 'agent-unavailable', error: 'x' })
    view('es', <MailSuggestions cards={[card()]} waiting={waiting} />)
    await click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(showToast).toHaveBeenCalled()
    dismiss.mockResolvedValueOnce({ ok: true })
    await click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('renders nothing when there is nothing to confirm', () => {
    const { container } = view('es', <MailSuggestions cards={[]} waiting={[]} />)
    expect(container.textContent).toBe('')
  })
})
