// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import type { CVVariant } from '@/lib/db/queries/cv-variants'
import { dictionary } from '@/lib/i18n/dictionary'
import type { CVContent } from '@/lib/schemas'

vi.mock('@/components/studio/PdfPager', () => ({ PdfPager: () => null }))
vi.mock('@/app/(app)/cvs/actions', () => ({ deleteVariantAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

const { VariantsManager } = await import('@/components/variants/VariantsManager')

afterEach(cleanup)

const cv: CVContent = {
  header: { fullName: 'G', title: 'Growth Lead', contactLines: [] },
  summary: '',
  summaryCitedEvidenceIds: [],
  experience: [],
  projects: [],
  education: [],
  skills: [],
  extras: [],
}

const row = (
  id: string,
  name: string,
  language: CVVariant['language'],
  focus = `focus ${id}`,
): CVVariant => ({
  id,
  name,
  focus,
  language,
  market: 'mx',
  cv,
  report: null,
  evidenceHash: 'h',
  composedAt: '2026-10-16T00:00:00.000Z',
})

function renderIn(locale: 'en' | 'es', variants: CVVariant[]) {
  return render(
    <LocaleProvider locale={locale}>
      <VariantsManager variants={variants} currentEvidenceHash="h" ownMarkets={['mx']} />
    </LocaleProvider>,
  )
}

describe('/cvs pairs', () => {
  const variants = [
    row('a', 'E-commerce', 'es-MX', 'foco en español'),
    row('b', 'AI', 'en'),
    row('c', 'E-commerce', 'en', 'english focus'),
  ]

  it('shows one card per name + market, with an EN | ES switch', () => {
    renderIn('es', variants)
    expect(screen.getAllByRole('article')).toHaveLength(2)
    const sides = screen.getByRole('group', { name: 'Idioma del CV' })
    expect(sides.textContent).toBe('Idioma del CVESEN')
    // The interface is Spanish: the pair opens on its Spanish side.
    expect(screen.getByText('foco en español')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('EN'))
    expect(screen.getByText('english focus')).toBeTruthy()
    expect(screen.queryByText('foco en español')).toBeNull()
    // Each side offers to be replaced by a translation of the other.
    expect(screen.getByRole('button', { name: 'Volver a traducir del español' })).toBeTruthy()
  })

  it('re-translating asks first, then replaces exactly the side shown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      renderIn('es', variants)
      fireEvent.click(screen.getByLabelText('EN'))
      fireEvent.click(screen.getByRole('button', { name: 'Volver a traducir del español' }))
      expect(fetchMock).not.toHaveBeenCalled()
      const confirm = screen.getByRole('button', { name: '¿Reemplazar este CV por la traducción?' })
      fireEvent.click(confirm)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/ai/variant/translate')
      expect(JSON.parse(init.body)).toEqual({ sourceId: 'a', targetId: 'c' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a lone row translates into a new row: no target is sent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      renderIn('en', [row('a', 'E-commerce', 'es-MX')])
      fireEvent.click(screen.getByRole('button', { name: 'Create English version' }))
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sourceId: 'a' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('says on the pair when the translation cut the source too', async () => {
    const stream = [
      'data: {"stage":"writing"}\n\n',
      'data: {"trimmedSource":3}\n\n',
      'data: {"done":true,"id":"c"}\n\n',
    ].join('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))
    try {
      renderIn('en', [row('a', 'E-commerce', 'es-MX')])
      fireEvent.click(screen.getByRole('button', { name: 'Create English version' }))
      await vi.waitFor(() =>
        expect(
          screen.getByText(dictionary.en['variants.trimmedPair'].replace('{n}', '3')),
        ).toBeTruthy(),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a lone row offers its other language, in either interface language', () => {
    renderIn('es', variants)
    expect(screen.getByRole('button', { name: 'Crear versión en español' })).toBeTruthy()
    cleanup()
    renderIn('en', [row('a', 'E-commerce', 'es-MX')])
    expect(screen.getByRole('button', { name: 'Create English version' })).toBeTruthy()
  })

  it('a lone row with no CV yet has nothing to translate', () => {
    renderIn('en', [{ ...row('a', 'E-commerce', 'es-MX'), cv: null, composedAt: null }])
    expect(screen.queryByRole('button', { name: 'Create English version' })).toBeNull()
  })

  it('every string it adds exists in both languages', () => {
    const keys = [
      'error.translate-mismatch',
      'variants.pairLanguage',
      'variants.side.en',
      'variants.side.es-MX',
      'variants.translateTo.en',
      'variants.translateTo.es-MX',
      'variants.retranslateFrom.en',
      'variants.retranslateFrom.es-MX',
      'variants.retranslateConfirm',
      'error.translate-target',
      'variants.translateHint',
      'variants.trimmedPair',
    ] as const
    for (const key of keys) {
      expect(dictionary.en[key]).toBeTruthy()
      expect(dictionary.es[key]).toBeTruthy()
    }
    expect(dictionary.es['variants.translateTo.es-MX']).not.toBe(
      dictionary.en['variants.translateTo.es-MX'],
    )
  })

  it('names no raw colour', () => {
    const src = readFileSync('components/variants/VariantsManager.tsx', 'utf8')
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|var\(--(?:graphite|amber)-/i)
  })
})
