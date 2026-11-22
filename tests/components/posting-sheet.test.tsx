// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PostingSheet } from '@/components/application/PostingSheet'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})
afterEach(cleanup)
const es = (ui: ReactNode) => render(<LocaleProvider locale="es">{ui}</LocaleProvider>)
const posting = 'Amazon Growth Specialist\nPilothouse\n\nWe are looking for…'

describe('Ver vacante', () => {
  it('opens the text that was analysed, line breaks kept, with the link and the date', () => {
    es(
      <PostingSheet
        postingRaw={posting}
        postingUrl="https://www.linkedin.com/jobs/view/1/"
        analysedAt="2026-10-01T15:00:00.000Z"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ver vacante' }))
    // Every line of what was analysed, each still its own line.
    const lines = [...document.querySelectorAll('dialog[open] .posting-text .posting-line')].map(
      (l) => l.textContent,
    )
    expect(lines).toEqual(['Amazon Growth Specialist', 'Pilothouse', 'We are looking for…'])
    expect(screen.getByRole('link', { name: /Abrir la publicación/ }).getAttribute('href')).toBe(
      'https://www.linkedin.com/jobs/view/1/',
    )
    expect(document.querySelector('dialog[open]')?.textContent).toMatch(/oct/)
  })

  it('without a link it shows only the text', () => {
    es(
      <PostingSheet postingRaw={posting} postingUrl={null} analysedAt="2026-10-01T15:00:00.000Z" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ver vacante' }))
    expect(screen.queryByRole('link')).toBeNull()
  })
})
