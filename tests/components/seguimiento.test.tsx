// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InterviewCard, toStoredTime } from '@/components/application/InterviewCard'
import { MailThread } from '@/components/application/MailThread'
import { YouList } from '@/components/application/YouList'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import type { InterviewView, ThreadCardView } from '@/lib/seguimiento-view'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const undo = vi.fn()
const setTime = vi.fn()
vi.mock('@/app/(app)/pipeline/actions', () => ({
  undoMailOutcomeAction: (...a: unknown[]) => undo(...a),
  setInterviewTimeAction: (...a: unknown[]) => setTime(...a),
}))
const showToast = vi.fn()
vi.mock('@/lib/ui/toast', () => ({ showToast: (...a: unknown[]) => showToast(...a) }))

beforeEach(() => {
  undo.mockReset()
  setTime.mockReset()
  showToast.mockClear()
  refresh.mockClear()
})
afterEach(cleanup)

const event: ThreadCardView = {
  key: 'm1',
  kind: 'event',
  chip: 'interview',
  date: '16 oct',
  dateTime: '2026-10-16T18:00:00.000Z',
  subject: 'Confirmación Entrevista',
  from: 'Halden · haldenco.com',
  quote: 'confirmo tu entrevista',
  link: 'https://mail.google.com/mail/#all/m1',
  outcomeId: 'out_1',
  folded: [
    {
      key: 'm2',
      date: '16 oct',
      dateTime: '2026-10-16T19:00:00.000Z',
      subject: 'Invitación: Entrevista',
      from: null,
      link: 'https://mail.google.com/mail/#all/m2',
    },
  ],
}
const plain: ThreadCardView = {
  key: 'h1',
  kind: 'mail',
  chip: 'mail',
  date: '7 oct',
  dateTime: '2026-10-07T18:00:00.000Z',
  subject: 'Welcome',
  from: 'Halden · successfactors.com',
  quote: '',
  link: 'https://mail.google.com/mail/#all/h1',
  outcomeId: null,
  folded: [],
}

const show = (ui: React.ReactNode, locale: 'es' | 'en' = 'es') =>
  render(<LocaleProvider locale={locale}>{ui}</LocaleProvider>)

describe('MailThread', () => {
  it('shows each email with kind, subject, sender, quote, Gmail link; the agent mark only on events', () => {
    show(<MailThread applicationId="app_1" cards={[event, plain]} count={3} empty="x" />)
    expect(screen.getByRole('heading', { name: 'Correo' })).toBeTruthy()
    expect(screen.getByText('3 correos')).toBeTruthy()
    // One grouped list, one row per email.
    expect(screen.getAllByRole('list')[0]?.children).toHaveLength(2)
    expect(screen.getByText('Entrevista')).toBeTruthy()
    // "Correo" is both the section heading and the plain email's kind.
    expect(screen.getAllByText('Correo')).toHaveLength(2)
    expect(screen.getByText('Halden · haldenco.com')).toBeTruthy()
    expect(screen.getByText('«confirmo tu entrevista»')).toBeTruthy()
    expect(screen.getAllByText('Agente')).toHaveLength(1)
    const links = screen.getAllByRole('link', { name: /Abrir en Gmail/ })
    // The row's own link (folded mails carry their subject instead).
    const own = links.find((l) => l.textContent === 'Gmail')
    expect(own?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(own?.getAttribute('target')).toBe('_blank')
    expect(screen.getAllByRole('button', { name: 'Deshacer' })).toHaveLength(1)
    // The link reads "Gmail" and is named for what it does.
    expect(own).toBeTruthy()
  })

  it('folds the duplicates under "+N correos más", each with its date, subject and link', () => {
    show(<MailThread applicationId="app_1" cards={[event]} count={2} empty="x" />)
    expect(screen.getByText('+1 correo más sobre esto')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Invitación: Entrevista/ })
    expect(link.getAttribute('href')).toBe('https://mail.google.com/mail/#all/m2')
  })

  it('Deshacer removes the agent event and refreshes; a refusal keeps it', async () => {
    undo.mockResolvedValueOnce({ ok: false, code: 'not-found', error: 'x' })
    show(<MailThread applicationId="app_1" cards={[event]} count={2} empty="x" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    })
    expect(screen.getByText('Confirmación Entrevista')).toBeTruthy()
    undo.mockResolvedValueOnce({ ok: true })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    })
    expect(undo).toHaveBeenLastCalledWith('app_1', 'out_1')
    expect(screen.queryByText('Confirmación Entrevista')).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  it('says why it is empty', () => {
    show(<MailThread applicationId="app_1" cards={[]} count={0} empty="Nada aún." />)
    expect(screen.getByText('Nada aún.')).toBeTruthy()
  })
})

describe('YouList', () => {
  it('lists what the user did, and nothing when there is nothing', () => {
    const { container } = show(<YouList items={[]} />)
    expect(container.textContent).toBe('')
    cleanup()
    show(
      <YouList
        items={[
          {
            key: 'd1',
            kind: 'followUp',
            type: null,
            date: '14 oct',
            dateTime: '2026-10-14',
            note: null,
          },
          {
            key: 'o1',
            kind: 'applied',
            type: 'applied',
            date: '7 oct',
            dateTime: '2026-10-07',
            note: null,
          },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Lo que registraste' })).toBeTruthy()
    expect(screen.getByText('Enviaste un seguimiento')).toBeTruthy()
    expect(screen.getByText('la envié')).toBeTruthy()
  })
})

describe('toStoredTime', () => {
  const zone = process.env.TZ
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  })

  it('converts the wall time in the browser zone to UTC (America/Mexico_City)', () => {
    process.env.TZ = 'America/Mexico_City'
    expect(toStoredTime('2026-10-21', '16:30')).toBe('2026-10-21T22:30:00.000Z')
  })

  it('and in another zone (Asia/Tokyo) the same wall time is another instant', () => {
    process.env.TZ = 'Asia/Tokyo'
    expect(toStoredTime('2026-10-21', '16:30')).toBe('2026-10-21T07:30:00.000Z')
  })

  it('saves a bare date when no time is given, and nothing for no date', () => {
    expect(toStoredTime('2026-10-21', '')).toBe('2026-10-21')
    expect(toStoredTime('', '10:00')).toBeNull()
    expect(toStoredTime('2026-10-21', '25:99x')).toBeNull()
  })
})

describe('InterviewCard', () => {
  const scheduled: InterviewView = {
    state: 'scheduled',
    outcomeId: 'out_9',
    kind: 'interview',
    month: 'oct',
    day: 20,
    weekday: 'martes',
    longDate: 'martes, 20 de octubre',
    dayLabel: 'mar 20 oct',
    time: '10:00 a.m.',
    daysFromToday: 4,
    source: 'agent',
    inputDate: '2026-10-20',
    inputTime: '10:00',
  }
  const dateOnly: InterviewView = { ...scheduled, time: null, source: null, inputTime: '' }

  it('shows the tile, the time, its source and the agent mark', () => {
    show(<InterviewCard applicationId="app_1" view={scheduled} />)
    // The shared call line (lib/call-line), as on the overview and the card.
    expect(screen.getByText('Entrevista · mar 20 oct · en 4 días')).toBeTruthy()
    expect(screen.getByText('10:00 a.m.')).toBeTruthy()
    expect(screen.getByText('Leído de la invitación de calendario del correo')).toBeTruthy()
    expect(screen.getByText('Agente')).toBeTruthy()
    // A time is known, so nothing says it is missing.
    expect(screen.queryByText(/sin hora/)).toBeNull()
  })

  it('claims no source when provenance is not positively known', () => {
    show(<InterviewCard applicationId="app_1" view={{ ...scheduled, source: null }} />)
    expect(screen.queryByText(/invitación/)).toBeNull()
    expect(screen.queryByText(/agregaste/)).toBeNull()
    expect(screen.queryByText('Agente')).toBeNull()
  })

  it('a date-only value shows only the day, says "sin hora", and its editor has no invented time', () => {
    show(<InterviewCard applicationId="app_1" view={dateOnly} />)
    expect(screen.getByText('Entrevista · mar 20 oct · en 4 días')).toBeTruthy()
    expect(screen.getByText(/sin hora/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Entrevista, martes, 20 de octubre' })).toBeTruthy()
    expect(screen.queryByText(/a\.m\.|p\.m\.|:\d\d/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-10-20')
    expect((screen.getByLabelText('Hora (opcional)') as HTMLInputElement).value).toBe('')
  })

  it('saving a date with no time stores the bare date', async () => {
    setTime.mockResolvedValue({ ok: true })
    show(<InterviewCard applicationId="app_1" view={dateOnly} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    })
    expect(setTime).toHaveBeenCalledWith('app_1', 'out_9', '2026-10-20')
  })

  it('Editar saves a picked date and time as UTC', async () => {
    setTime.mockResolvedValue({ ok: true })
    show(<InterviewCard applicationId="app_1" view={scheduled} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-21' } })
    fireEvent.change(screen.getByLabelText('Hora (opcional)'), { target: { value: '16:30' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    })
    expect(setTime).toHaveBeenCalledWith('app_1', 'out_9', toStoredTime('2026-10-21', '16:30'))
    expect(setTime.mock.calls[0]?.[2]).toMatch(/Z$/)
    expect(refresh).toHaveBeenCalled()
  })

  it('Quitar fecha clears it; a refusal shows an error, not "application gone"', async () => {
    setTime.mockResolvedValue({ ok: false, code: 'not-found', error: 'x' })
    show(<InterviewCard applicationId="app_1" view={scheduled} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Quitar fecha' }))
    })
    expect(setTime).toHaveBeenCalledWith('app_1', 'out_9', null)
    expect(screen.getByRole('alert').textContent).toBe(
      'No se pudo guardar la fecha. Inténtalo de nuevo.',
    )
  })

  it('with no date it asks for one', () => {
    show(
      <InterviewCard
        applicationId="app_1"
        view={{ state: 'prompt', outcomeId: 'out_9', kind: 'screen' }}
      />,
    )
    expect(screen.getByText('¿Cuándo es la llamada?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }))
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Quitar fecha' })).toBeNull()
  })
})
