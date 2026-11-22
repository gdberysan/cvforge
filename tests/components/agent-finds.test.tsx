// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { AgentFinds, type FindCard } from '@/components/today/AgentFinds'
import { must } from '../support/must'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const chaseFindAction = vi.fn()
const dismissFindAction = vi.fn()
vi.mock('@/app/(app)/agent/actions', () => ({
  chaseFindAction: (...a: unknown[]) => chaseFindAction(...a),
  dismissFindAction: (...a: unknown[]) => dismissFindAction(...a),
}))
const showToast = vi.fn()
vi.mock('@/lib/ui/toast', () => ({ showToast: (...a: unknown[]) => showToast(...a) }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  push.mockClear()
  chaseFindAction.mockReset()
  dismissFindAction.mockReset()
  showToast.mockClear()
})
afterEach(cleanup)

const es = (ui: ReactNode) => render(<LocaleProvider locale="es">{ui}</LocaleProvider>)
const card = (over: Partial<FindCard> = {}): FindCard => ({
  postingId: '4460829599',
  jobTitle: 'Growth Marketing Manager',
  company: 'Acme',
  source: 'linkedin',
  verdict: 'strong',
  createdAt: new Date(Date.now() - 40 * 60_000).toISOString(),
  strong: 8,
  total: 11,
  summary:
    'Liderarás la estrategia de crecimiento de la marca en canales pagados y marketplaces de México.',
  summaryLang: 'es',
  groups: [
    {
      tone: 'missing',
      rows: [
        { keyword: 'SQL', strength: 'none', unjudged: false },
        { keyword: 'Tableau', strength: 'none', unjudged: false },
      ],
    },
    { tone: 'partial', rows: [{ keyword: 'B2B SaaS', strength: 'partial', unjudged: false }] },
    { tone: 'strong', rows: [{ keyword: 'Google Ads', strength: 'strong', unjudged: false }] },
  ],
  postingRaw: 'Buscamos…',
  sourceUrl: 'https://www.linkedin.com/jobs/view/4460829599/',
  ...over,
})

describe('AgentFinds', () => {
  it('shows each find with its verdict, age and coverage', () => {
    es(
      <AgentFinds
        finds={[card(), card({ postingId: '2', jobTitle: 'Automation Lead', verdict: 'worth-it' })]}
        highlight={null}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Nuevas del agente' })).toBeTruthy()
    const items = screen.getAllByRole('article')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toMatch('Growth Marketing Manager')
    expect(items[0]?.textContent).toMatch('Coincidencia fuerte')
    expect(items[0]?.textContent).toMatch('hace 40 min')
    expect(items[0]?.textContent).toMatch('8 de 11')
  })

  it('shows no count when the extraction found no mandatory requirements', () => {
    es(<AgentFinds finds={[card({ strong: 0, total: 0 })]} highlight={null} />)
    const article = screen.getByRole('article')
    expect(article.querySelector('.find-verdict')?.textContent).toBe('Coincidencia fuerte')
    expect(article.querySelector('.find-count')).toBeNull()
  })

  it('lays out the card: company · age (no guessed market), the verdict line with "Ver detalles", the pair last', () => {
    es(<AgentFinds finds={[card()]} highlight={null} />)
    const article = screen.getByRole('article')
    const meta = must(article.querySelector('.find-meta'), '.find-meta')
    expect(meta.textContent).toMatch('Acme')
    expect(meta.textContent).not.toMatch('México')
    expect(meta.textContent).not.toMatch(/Remoto/i)
    expect(article.querySelector('.verdict-text-strong')?.textContent).toBe('Coincidencia fuerte')
    expect(article.querySelector('.find-count')?.textContent).toBe(' · 8 de 11 obligatorios')
    expect(within(article).getByRole('button', { name: /Ver detalles/ })).toBeTruthy()
    const pair = must(article.querySelector('.find-pair'), '.find-pair')
    expect([...pair.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Descartar',
      'Ir por ella',
    ])
    expect(article.lastElementChild).toBe(pair)
  })

  it('"Ver detalles" opens the preview: summary, fit, mandatory chips missing first, links, the pair', () => {
    es(<AgentFinds finds={[card()]} highlight={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalles/ }))
    const sheet = screen.getByRole('dialog', { name: 'Growth Marketing Manager' })
    expect(sheet.textContent).toMatch('Acme')
    expect(within(sheet).getByRole('heading', { name: 'De qué trata el puesto' })).toBeTruthy()
    expect(sheet.textContent).toMatch('Liderarás la estrategia')
    expect(sheet.textContent).toMatch('Coincidencia fuerte · cubres 8 de 11 obligatorios')
    const groups = within(sheet)
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent)
    expect(groups).toEqual(['Te faltan', 'A medias', 'Los cumples'])
    expect(sheet.textContent).toMatch('SQL')
    expect(sheet.textContent).toMatch('Google Ads')
    const link = within(sheet).getByRole('link', { name: /Abrir en LinkedIn/ })
    expect(link.getAttribute('href')).toBe('https://www.linkedin.com/jobs/view/4460829599/')
    expect(sheet.querySelector('.posting-text')).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Leer la vacante completa' }))
    expect(sheet.querySelector('.posting-text')?.textContent).toBe('Buscamos…')
    expect(within(sheet).getByRole('button', { name: 'Ir por ella' })).toBeTruthy()
  })

  it('folds a group of more than eight to six and "+N más"; eight stays whole; Te falta never folds', () => {
    const rows = (n: number, strength: 'none' | 'strong') =>
      Array.from({ length: n }, (_, i) => ({
        keyword: `K${strength}${i + 1}`,
        strength,
        unjudged: false,
      }))
    es(
      <AgentFinds
        finds={[
          card({
            groups: [
              { tone: 'missing', rows: rows(8, 'none') },
              { tone: 'strong', rows: rows(9, 'strong') },
            ],
          }),
        ]}
        highlight={null}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ver detalles/ }))
    const sheet = screen.getByRole('dialog')
    const [missing, strong] = Array.from(sheet.querySelectorAll('.req-tone'))
    expect(missing?.querySelectorAll('.fact-chip')).toHaveLength(8)
    expect(missing?.querySelector('.chips-more')).toBeNull()
    expect(strong?.querySelectorAll('.fact-chip')).toHaveLength(6)
    expect(sheet.textContent).not.toMatch('Kstrong7')
    const more = within(sheet).getByRole('button', { name: '+3 más' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(strong?.querySelectorAll('.fact-chip')).toHaveLength(9)
    const less = within(sheet).getByRole('button', { name: 'Ver menos' })
    expect(less.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(less)
    expect(strong?.querySelectorAll('.fact-chip')).toHaveLength(6)
  })

  it('a group of eight never folds: a fold hides at least three', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      keyword: `K${i + 1}`,
      strength: 'strong' as const,
      unjudged: false,
    }))
    es(<AgentFinds finds={[card({ groups: [{ tone: 'strong', rows }] })]} highlight={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalles/ }))
    const sheet = screen.getByRole('dialog')
    expect(sheet.querySelectorAll('.fact-chip')).toHaveLength(8)
    expect(sheet.querySelector('.chips-more')).toBeNull()
  })

  it('a tap on the card body opens the preview, with nothing it was not given', () => {
    es(<AgentFinds finds={[card({ summary: null, sourceUrl: null })]} highlight={null} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Growth Marketing Manager' }))
    const sheet = screen.getByRole('dialog')
    expect(sheet.hasAttribute('open')).toBe(true)
    // No summary, no URL: the blocks are left out, nothing invented.
    expect(within(sheet).queryByRole('heading', { name: 'De qué trata el puesto' })).toBeNull()
    expect(within(sheet).queryByRole('link')).toBeNull()
  })

  it("the card's own buttons do not open the preview", async () => {
    // A failed dismiss keeps the card on screen, so the sheet's state can be read after.
    dismissFindAction.mockResolvedValue({ ok: false })
    chaseFindAction.mockResolvedValue({ ok: false, code: 'unknown' })
    es(<AgentFinds finds={[card()]} highlight={null} />)
    const article = screen.getByRole('article')
    const dialog = () => document.querySelector('dialog.sheet') as HTMLDialogElement
    await act(async () => {
      fireEvent.click(within(article).getByRole('button', { name: 'Descartar' }))
    })
    expect(dismissFindAction).toHaveBeenCalled()
    expect(dialog().hasAttribute('open')).toBe(false)
    await act(async () => {
      fireEvent.click(within(article).getByRole('button', { name: 'Ir por ella' }))
    })
    expect(chaseFindAction).toHaveBeenCalled()
    expect(dialog().hasAttribute('open')).toBe(false)
  })

  it('closing the sheet opened from the card body returns focus to the card', () => {
    es(<AgentFinds finds={[card()]} highlight={null} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Growth Marketing Manager' }))
    const dialog = document.querySelector('dialog.sheet') as HTMLDialogElement
    dialog.close()
    fireEvent(dialog, new Event('close'))
    expect(document.activeElement?.textContent).toMatch('Ver detalles')
  })

  it("the sheet's Perseguir chases and opens the application", async () => {
    chaseFindAction.mockResolvedValue({ ok: true, applicationId: 'app_9', kit: 'queued' })
    es(<AgentFinds finds={[card()]} highlight={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalles/ }))
    const sheet = screen.getByRole('dialog')
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Ir por ella' }))
    })
    expect(chaseFindAction).toHaveBeenCalledWith('4460829599')
    expect(push).toHaveBeenCalledWith('/application/app_9?step=docs')
  })

  it('a failure inside the sheet closes it first, so the toast is seen', async () => {
    chaseFindAction.mockResolvedValue({ ok: false, code: 'unknown' })
    dismissFindAction.mockResolvedValue({ ok: false })
    es(<AgentFinds finds={[card()]} highlight={null} />)
    const dialog = () => document.querySelector('dialog.sheet') as HTMLDialogElement
    fireEvent.click(screen.getByRole('button', { name: /Ver detalles/ }))
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Ir por ella' }),
      )
    })
    expect(dialog().hasAttribute('open')).toBe(false)
    expect(showToast).toHaveBeenCalledWith('No funcionó. Inténtalo de nuevo en un momento.')
    fireEvent.click(screen.getByRole('button', { name: /Ver detalles/ }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Descartar' }))
    })
    expect(dialog().hasAttribute('open')).toBe(false)
    expect(showToast).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('the sheet pair does what the card pair does', async () => {
    dismissFindAction.mockResolvedValue({ ok: true })
    es(<AgentFinds finds={[card()]} highlight={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalles/ }))
    const sheet = screen.getByRole('dialog')
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Descartar' }))
    })
    expect(dismissFindAction).toHaveBeenCalledWith('4460829599')
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('highlights and scrolls to the find a push opened', () => {
    es(<AgentFinds finds={[card(), card({ postingId: '2' })]} highlight="2" />)
    expect(document.getElementById('find-2')?.className).toMatch('is-highlighted')
    expect(document.getElementById('find-4460829599')?.className).not.toMatch('is-highlighted')
  })

  it('Perseguir chases, says the kit is coming, and opens the application', async () => {
    chaseFindAction.mockResolvedValue({ ok: true, applicationId: 'app_1', kit: 'queued' })
    es(<AgentFinds finds={[card()]} highlight={null} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ir por ella' }))
    })
    expect(chaseFindAction).toHaveBeenCalledWith('4460829599')
    expect(showToast).toHaveBeenCalledWith('Preparando el kit. Te aviso cuando esté.')
    expect(push).toHaveBeenCalledWith('/application/app_1?step=docs')
  })

  it('over the daily cap it says so', async () => {
    chaseFindAction.mockResolvedValue({ ok: true, applicationId: 'app_1', kit: 'cap' })
    es(<AgentFinds finds={[card()]} highlight={null} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ir por ella' }))
    })
    expect(showToast).toHaveBeenCalledWith('Ya se usaron los kits de hoy. Genera este a mano.')
  })

  it('a find already handled elsewhere leaves the list', async () => {
    chaseFindAction.mockResolvedValue({ ok: false, code: 'gone' })
    es(<AgentFinds finds={[card()]} highlight={null} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ir por ella' }))
    })
    expect(showToast).toHaveBeenCalledWith('Esta vacante ya no está pendiente.')
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(push).not.toHaveBeenCalled()
  })

  it('Descartar removes the card', async () => {
    dismissFindAction.mockResolvedValue({ ok: true })
    es(<AgentFinds finds={[card()]} highlight={null} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    })
    expect(dismissFindAction).toHaveBeenCalledWith('4460829599')
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('renders nothing with no finds', () => {
    const { container } = es(<AgentFinds finds={[]} highlight={null} />)
    expect(container.textContent).toBe('')
  })
})
