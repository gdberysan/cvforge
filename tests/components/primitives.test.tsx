// tests/components/primitives.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Chip } from '@/components/ui/Chip'
import { HeroStat } from '@/components/ui/HeroStat'
import { Segmented } from '@/components/ui/Segmented'
import { Sheet } from '@/components/ui/Sheet'
import { sparkPath } from '@/components/ui/Sparkline'

afterEach(cleanup)
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

describe('Chip', () => {
  it('carries its tone in the accessible name, not only in colour', () => {
    render(
      <Chip tone="missing" toneLabel="falta" onClick={() => {}}>
        Bulksheets
      </Chip>,
    )
    expect(screen.getByRole('button', { name: /Bulksheets.*falta/ })).toBeTruthy()
  })
  it('is a plain span without onClick', () => {
    const { container } = render(<Chip tone="neutral">x</Chip>)
    expect(container.querySelector('button')).toBeNull()
  })
})

function SheetHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Detalle">
        <p>contenido</p>
      </Sheet>
    </>
  )
}

describe('Sheet', () => {
  it('opens as a dialog with its title and returns focus to the opener on close', () => {
    render(<SheetHarness />)
    const opener = screen.getByText('opener')
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(screen.getByText('Detalle')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /cerrar|close/i, hidden: true }))
    expect(dialog.hasAttribute('open')).toBe(false)
    expect(document.activeElement).toBe(opener)
  })
})

describe('sparkPath', () => {
  it('breaks the line at a null instead of dropping to zero', () => {
    const d = sparkPath([10, 20, null, 30, 40], 100, 40)
    expect(d.match(/M/g)?.length).toBe(2)
  })
  it('draws nothing for an all-null series', () => {
    expect(sparkPath([null, null], 100, 40)).toBe('')
  })
})

describe('HeroStat', () => {
  it('shows the value and label, and no delta chip when delta is null', () => {
    const { container } = render(<HeroStat value="—" label="aún no hay datos" delta={null} />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(container.querySelector('.hero-delta')).toBeNull()
  })
})

describe('Segmented', () => {
  it('is a group of real radios and reports the picked value', () => {
    let picked = 'a'
    render(
      <Segmented
        label="Filtro"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={(v) => {
          picked = v
        }}
      />,
    )
    expect(screen.getByRole('group', { name: 'Filtro' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'B' }))
    expect(picked).toBe('b')
  })
})

describe('Sheet, phase 3', () => {
  it('gives each sheet its own title id', () => {
    render(
      <>
        <Sheet open title="A" onClose={() => {}}>
          a
        </Sheet>
        <Sheet open title="B" onClose={() => {}}>
          b
        </Sheet>
      </>,
    )
    const ids = [...document.querySelectorAll('dialog')].map((d) =>
      d.getAttribute('aria-labelledby'),
    )
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(document.getElementById(id ?? '')).toBeTruthy()
  })

  it('locks page scroll while open and restores it on close and on unmount', () => {
    const sheet = (open: boolean) => (
      <Sheet open={open} title="A" onClose={() => {}}>
        a
      </Sheet>
    )
    const { rerender, unmount } = render(sheet(true))
    expect(document.documentElement.classList.contains('sheet-open')).toBe(true)
    rerender(sheet(false))
    expect(document.documentElement.classList.contains('sheet-open')).toBe(false)
    rerender(sheet(true))
    unmount()
    expect(document.documentElement.classList.contains('sheet-open')).toBe(false)
  })

  it('keeps the lock while a second sheet is still open', () => {
    const { rerender } = render(
      <>
        <Sheet open title="A" onClose={() => {}}>
          a
        </Sheet>
        <Sheet open title="B" onClose={() => {}}>
          b
        </Sheet>
      </>,
    )
    rerender(
      <>
        <Sheet open={false} title="A" onClose={() => {}}>
          a
        </Sheet>
        <Sheet open title="B" onClose={() => {}}>
          b
        </Sheet>
      </>,
    )
    expect(document.documentElement.classList.contains('sheet-open')).toBe(true)
  })
})
