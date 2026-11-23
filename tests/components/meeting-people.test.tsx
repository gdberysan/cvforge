// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hidePersonAction, savePersonAction } from '@/app/(app)/application/[id]/people-actions'
import { MeetingPeople } from '@/components/application/MeetingPeople'

vi.mock('@/app/(app)/application/[id]/people-actions', () => ({
  savePersonAction: vi.fn().mockResolvedValue({ ok: true }),
  hidePersonAction: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const marco = {
  id: 'per_1',
  name: 'Marco Ibarra',
  email: 'marco@x.com',
  role: 'eComm Strategy & Planning Sr. Manager',
  roleQuote: 'tu entrevista con Marco Ibarra, eComm Strategy & Planning Sr. Manager',
  source: 'mail' as const,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MeetingPeople', () => {
  it('names who he is meeting, their role, and the way in', () => {
    render(
      <MeetingPeople
        applicationId="app_1"
        people={[marco]}
        meetingUrl="https://teams.microsoft.com/l/x"
      />,
    )
    expect(screen.getByText('Marco Ibarra')).toBeTruthy()
    expect(screen.getByText('eComm Strategy & Planning Sr. Manager')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Join the meeting' }).getAttribute('href')).toBe(
      'https://teams.microsoft.com/l/x',
    )
  })

  it('says a role is missing without claiming no email states it', () => {
    render(
      <MeetingPeople
        applicationId="app_1"
        people={[{ ...marco, role: '', roleQuote: '' }]}
        meetingUrl={null}
      />,
    )
    expect(screen.getByText('Role not confirmed')).toBeTruthy()
  })

  it('adds a person by hand', async () => {
    render(<MeetingPeople applicationId="app_1" people={[]} meetingUrl={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a person' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ana Ruiz' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Recruiter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(savePersonAction).toHaveBeenCalledWith({
        applicationId: 'app_1',
        name: 'Ana Ruiz',
        email: '',
        role: 'Recruiter',
      }),
    )
  })

  it('corrects a person the agent found, keeping their id', async () => {
    render(<MeetingPeople applicationId="app_1" people={[marco]} meetingUrl={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Marco Ibarra' }))
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Hiring manager' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(savePersonAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'per_1', role: 'Hiring manager' }),
      ),
    )
  })

  it('removes a person for good', async () => {
    render(<MeetingPeople applicationId="app_1" people={[marco]} meetingUrl={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Marco Ibarra' }))
    await waitFor(() =>
      expect(hidePersonAction).toHaveBeenCalledWith({ applicationId: 'app_1', id: 'per_1' }),
    )
  })

  it('says so when a save fails, and keeps what he typed', async () => {
    vi.mocked(savePersonAction).mockResolvedValueOnce({
      ok: false,
      error: 'A name is required.',
      code: 'invalid-request',
    })
    render(<MeetingPeople applicationId="app_1" people={[]} meetingUrl={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a person' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ana Ruiz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not save this person. Check the name and try again.',
    )
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ana Ruiz')
  })

  it('says so when a removal fails, even when the server is unreachable', async () => {
    vi.mocked(hidePersonAction).mockRejectedValueOnce(new Error('fetch failed'))
    render(<MeetingPeople applicationId="app_1" people={[marco]} meetingUrl={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Marco Ibarra' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not remove Marco Ibarra. Reload the page and try again.',
    )
  })
})
