// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FollowUpDraft, type FollowUpDraftView } from '@/components/application/FollowUpDraft'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { dictionary } from '@/lib/i18n/dictionary'
import { scanSource } from '../design/scan'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const markUsed = vi.fn()
vi.mock('@/app/(app)/pipeline/actions', () => ({
  markDraftUsedAction: (...a: unknown[]) => markUsed(...a),
}))
const showToast = vi.fn()
vi.mock('@/lib/ui/toast', () => ({ showToast: (...a: unknown[]) => showToast(...a) }))

const order: string[] = []
const writeText = vi.fn(async (_: string) => {
  order.push('copy')
})
const open = vi.fn((..._: unknown[]) => {
  order.push('open')
  return null
})

beforeEach(() => {
  order.length = 0
  writeText.mockClear()
  open.mockClear()
  markUsed.mockReset()
  showToast.mockClear()
  refresh.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.stubGlobal('open', open)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const draft: FollowUpDraftView = {
  id: 'fud_1',
  to: 'rh@acme.mx',
  subject: 'Seguimiento: Growth Lead',
  body: 'Hola,\n\nSigo interesada.\n\nSaludos,',
  usedAt: null,
}

const show = (d: FollowUpDraftView | null, locale: 'es' | 'en' = 'es') =>
  render(
    <LocaleProvider locale={locale}>
      <FollowUpDraft applicationId="app_1" draft={d} />
    </LocaleProvider>,
  )

describe('FollowUpDraft', () => {
  it('renders nothing without a draft', () => {
    const { container } = show(null)
    expect(container.textContent).toBe('')
  })

  it('Copiar copies the subject, a blank line, and the body', async () => {
    show(draft)
    expect(screen.getByText('Para rh@acme.mx')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    })
    expect(writeText).toHaveBeenCalledWith(`${draft.subject}\n\n${draft.body}`)
    expect(showToast).toHaveBeenCalledWith('Copiado.')
  })

  it('Abrir en Gmail opens the encoded compose URL, body included', async () => {
    show(draft)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir en Gmail' }))
    })
    expect(writeText).not.toHaveBeenCalled()
    const url = new URL(open.mock.calls[0][0] as string)
    expect(url.searchParams.get('to')).toBe(draft.to)
    expect(url.searchParams.get('su')).toBe(draft.subject)
    expect(url.searchParams.get('body')).toBe(draft.body)
    expect(open.mock.calls[0][1]).toBe('_blank')
  })

  it('a body too long for a link is copied first, then Gmail opens without it', async () => {
    const long = { ...draft, body: 'ñ'.repeat(500) }
    show(long)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir en Gmail' }))
    })
    expect(order).toEqual(['copy', 'open'])
    expect(writeText).toHaveBeenCalledWith(long.body)
    const url = new URL(open.mock.calls[0][0] as string)
    expect(url.searchParams.has('body')).toBe(false)
    expect(url.searchParams.get('su')).toBe(draft.subject)
    expect(showToast).toHaveBeenCalledWith(dictionary.es['followup.bodyCopied'])
  })

  it('"Ya lo envié" calls the action and shows the date it was sent', async () => {
    markUsed.mockResolvedValue({ ok: true, usedAt: '2026-10-14T15:00:00.000Z' })
    show(draft)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ya lo envié' }))
    })
    expect(markUsed).toHaveBeenCalledWith('app_1', 'fud_1')
    expect(screen.getByText(/^Enviado el .*2026/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ya lo envié' })).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  it('a refused mark keeps the button and says so', async () => {
    markUsed.mockResolvedValue({ ok: false, code: 'not-found', error: 'x' })
    show(draft)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ya lo envié' }))
    })
    expect(screen.getByRole('button', { name: 'Ya lo envié' })).toBeTruthy()
    expect(showToast).toHaveBeenCalled()
  })

  it('an empty recipient says to write it in Gmail', () => {
    show({ ...draft, to: '' })
    expect(screen.getByText('Sin destinatario. Agrégalo en Gmail.')).toBeTruthy()
  })

  it('reads in English too, with an already-sent draft', () => {
    show({ ...draft, to: '', usedAt: '2026-10-14T15:00:00.000Z' }, 'en')
    expect(screen.getByText('Follow-up draft')).toBeTruthy()
    expect(screen.getByText('No recipient. Add one in Gmail.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open in Gmail' })).toBeTruthy()
    expect(screen.getByText(/^Sent on October 14, 2026$/)).toBeTruthy()
  })

  it('every followup key exists in both languages', () => {
    const en = Object.keys(dictionary.en)
      .filter((k) => k.startsWith('followup.'))
      .sort()
    const es = Object.keys(dictionary.es)
      .filter((k) => k.startsWith('followup.'))
      .sort()
    expect(en.length).toBeGreaterThan(0)
    expect(es).toEqual(en)
    for (const k of en) {
      expect((dictionary.es as Record<string, string>)[k]?.trim(), k).toBeTruthy()
    }
  })

  it('names no raw colour, in the component or its CSS', () => {
    const tsx = scanSource(
      'a.tsx',
      readFileSync('components/application/FollowUpDraft.tsx', 'utf8'),
    )
    const css = readFileSync('app/globals.css', 'utf8')
    const start = css.indexOf('/* ── Follow-up draft')
    expect(start).toBeGreaterThan(0)
    const end = css.indexOf('/* ──', start + 5)
    const block = scanSource('a.css', css.slice(start, end === -1 ? undefined : end))
    for (const found of [tsx, block]) {
      expect(found['raw-colour']).toBeUndefined()
      expect(found['palette-var']).toBeUndefined()
    }
  })
})
