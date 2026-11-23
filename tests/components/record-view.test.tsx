// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvidenceRecord } from '@/components/evidence/EvidenceRecord'
import { RecordView } from '@/components/evidence/RecordView'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import type { EvidenceItem } from '@/lib/schemas'

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

import { beforeAll } from 'vitest'

beforeAll(() => {
  // jsdom has <dialog> but not its modal methods.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const renderEs = (ui: ReactNode) => render(<LocaleProvider locale="es">{ui}</LocaleProvider>)

const item: EvidenceItem = {
  id: 'ev_1',
  kind: 'achievement',
  sourceRef: { type: 'experience', id: 'exp_1' },
  text: 'Reduje el abandono del checkout de la tienda en Amazon',
  metrics: [{ raw: '18%' }],
  tags: [],
  period: { start: '2022-01' },
  strength: 'core',
  origin: 'manual',
}

describe('RecordView', () => {
  it('shows the text and the metric chips, never the kind as a label', () => {
    renderEs(<RecordView item={item} onOpen={vi.fn()} onAddNumber={vi.fn()} />)
    expect(screen.getByText(item.text)).toBeTruthy()
    expect(screen.getByText('18%')).toBeTruthy()
    expect(screen.queryByText('logro')).toBeNull()
  })

  it('tapping the text or Editar opens the editor', () => {
    const onOpen = vi.fn()
    renderEs(<RecordView item={item} onOpen={onOpen} onAddNumber={vi.fn()} />)
    fireEvent.click(screen.getByText(item.text))
    fireEvent.click(screen.getByRole('button', { name: 'Editar esta entrada' }))
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('an achievement with no number offers "Añadir un número"', () => {
    const onAddNumber = vi.fn()
    renderEs(
      <RecordView item={{ ...item, metrics: [] }} onOpen={vi.fn()} onAddNumber={onAddNumber} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Agregar un número' }))
    expect(onAddNumber).toHaveBeenCalledOnce()
  })

  it('a skill never asks for a number', () => {
    renderEs(
      <RecordView
        item={{ ...item, kind: 'skill-claim', metrics: [] }}
        onOpen={vi.fn()}
        onAddNumber={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Agregar un número' })).toBeNull()
  })
})

describe('EvidenceRecord, phase 3', () => {
  it('a result without a number has its field waiting; typing makes it one', () => {
    const onChange = vi.fn()
    renderEs(
      <EvidenceRecord
        item={{ ...item, metrics: [] }}
        onChange={onChange}
        onDelete={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    const field = screen.getByLabelText('Cifra, escrita como la dirías')
    // Waiting, not focused: on a filtered page every open result has one.
    expect(document.activeElement).not.toBe(field)
    fireEvent.change(field, { target: { value: '18%' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ metrics: [expect.objectContaining({ raw: '18%', value: 18 })] }),
    )
  })

  it('a skill has no waiting field, and "add" does not say "another"', () => {
    renderEs(
      <EvidenceRecord
        item={{ ...item, kind: 'skill-claim', metrics: [] }}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Cifra, escrita como la dirías')).toBeNull()
    expect(screen.getByRole('button', { name: 'Agregar una cifra' })).toBeTruthy()
  })

  it('the editor shows what the chosen type means', () => {
    renderEs(<EvidenceRecord item={item} onChange={vi.fn()} onDelete={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByText(/Un resultado que cambió algo/)).toBeTruthy()
  })

  it('the editor has "Listo", which calls onDone', () => {
    const onDone = vi.fn()
    renderEs(<EvidenceRecord item={item} onChange={vi.fn()} onDelete={vi.fn()} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('focusing a field keeps it in view above the keyboard', () => {
    const spy = vi.fn()
    Element.prototype.scrollIntoView = spy
    // jsdom puts every rect at 0; a window 0px tall makes any field "below the fold".
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(0)
    renderEs(<EvidenceRecord item={item} onChange={vi.fn()} onDelete={vi.fn()} onDone={vi.fn()} />)
    fireEvent.focus(screen.getByLabelText('Lo que hiciste, completo'))
    expect(spy).toHaveBeenCalled()
  })
})
