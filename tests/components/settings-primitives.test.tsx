// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsGroup'
import { Switch } from '@/components/ui/Switch'

afterEach(cleanup)

describe('Switch', () => {
  it('is a switch that says whether it is on, and asks to flip on a tap', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Avisarme" />)
    const sw = screen.getByRole('switch', { name: 'Avisarme' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
  it('does nothing while disabled', () => {
    const onChange = vi.fn()
    render(<Switch checked onChange={onChange} label="X" disabled />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('SettingsGroup', () => {
  it('is a labelled section with a title, a line on what it is for, and rows', () => {
    render(
      <SettingsGroup title="Datos" lede="Respaldos y actualizaciones.">
        <SettingsRow label="Respaldo" hint="Todo en un archivo">
          <button type="button">Descargar</button>
        </SettingsRow>
      </SettingsGroup>,
    )
    const group = screen.getByRole('region', { name: 'Datos' })
    expect(group.textContent).toContain('Respaldos y actualizaciones.')
    expect(group.querySelector('.settings-row')?.textContent).toContain('Todo en un archivo')
  })
})
