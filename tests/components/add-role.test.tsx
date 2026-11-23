// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addRoleAction } from '@/app/(app)/evidence/actions'
import { AddRole } from '@/components/evidence/AddRole'

vi.mock('@/app/(app)/evidence/actions', () => ({ addRoleAction: vi.fn() }))

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

function openAndFill() {
  render(<AddRole />)
  fireEvent.click(screen.getByRole('button', { name: 'Add a role your CV missed' }))
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Engineer' } })
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Tiendamax' } })
  // Month and year from two lists, the way people say a date.
  fireEvent.change(screen.getByLabelText('Started: Month'), { target: { value: '07' } })
  fireEvent.change(screen.getByLabelText('Started: Year'), { target: { value: '2025' } })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AddRole', () => {
  it('the primary action saves the role and goes to its interview', async () => {
    vi.mocked(addRoleAction).mockResolvedValue({ ok: true, roleId: 'exp_abc12345' })

    openAndFill()
    fireEvent.click(screen.getByRole('button', { name: 'Add it and answer a few questions' }))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/evidence/interview/exp_abc12345'))
    // "I still work here" starts checked: no end month is sent.
    expect(addRoleAction).toHaveBeenCalledWith({
      title: 'Engineer',
      company: 'Tiendamax',
      start: '2025-07',
    })
  })

  it('a finished job needs its end month, and sends it', async () => {
    vi.mocked(addRoleAction).mockResolvedValue({ ok: true, roleId: 'exp_abc12345' })
    openAndFill()
    fireEvent.click(screen.getByLabelText('I still work here'))
    const submit = screen.getByRole('button', { name: 'Add it and answer a few questions' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Ended: Month'), { target: { value: '03' } })
    fireEvent.change(screen.getByLabelText('Ended: Year'), { target: { value: '2026' } })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(submit)
    await vi.waitFor(() =>
      expect(addRoleAction).toHaveBeenCalledWith(expect.objectContaining({ end: '2026-03' })),
    )
  })

  it('the quiet action saves the role and stays on the page', async () => {
    // The interview is optional; a role your CV missed must be addable
    // without committing to answering questions right now.
    vi.mocked(addRoleAction).mockResolvedValue({ ok: true, roleId: 'exp_abc12345' })

    openAndFill()
    fireEvent.click(screen.getByRole('button', { name: 'Just add the role' }))

    // The form folds back to its trigger once the role is saved.
    await screen.findByRole('button', { name: 'Add a role your CV missed' })
    expect(addRoleAction).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('a refused save shows the error and keeps the form open', async () => {
    vi.mocked(addRoleAction).mockResolvedValue({
      ok: false,
      error: 'Demo is read-only.',
      code: 'demo-read-only',
    })

    openAndFill()
    fireEvent.click(screen.getByRole('button', { name: 'Just add the role' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This is the demo')
    expect(push).not.toHaveBeenCalled()
  })
})
