import { describe, expect, it } from 'vitest'
import { buildThread, senderOf } from '@/lib/mail-thread'
import { dayLabel, seguimientoView, senderLine } from '@/lib/seguimiento-view'

const NOW = Date.parse('2026-10-16T15:00:00.000Z')
const TZ = 'America/Mexico_City'

describe('senderLine', () => {
  it('keeps a display name the email gave', () => {
    expect(senderLine(senderOf('Halden Talent <jobs@haldenco.com>'), 'Halden')).toBe(
      'Halden Talent · haldenco.com',
    )
  })

  it('names the application’s company when the email gave only an address', () => {
    expect(senderLine(senderOf('noreply@paradox.haldenco.com'), 'Halden')).toBe(
      'Halden · paradox.haldenco.com',
    )
  })

  it('falls back to the domain alone with no company, and null with no sender', () => {
    expect(senderLine(senderOf('jobs@acme.com'), '  ')).toBe('acme.com')
    expect(senderLine(null, 'Acme')).toBeNull()
  })
})

describe('dayLabel', () => {
  it('reads the day in the user zone, without the trailing period', () => {
    // 03:00 UTC on the 17th is still the 16th in Mexico City.
    expect(dayLabel('2026-10-17T03:00:00.000Z', 'es', TZ, NOW)).toBe('16 oct')
    expect(dayLabel('2026-10-17T03:00:00.000Z', 'en', TZ, NOW)).toBe('Oct 16')
  })

  it('adds the year only when it is not this year, and is empty for garbage', () => {
    expect(dayLabel('2025-12-30T18:00:00.000Z', 'es', TZ, NOW)).toMatch(/2025/)
    expect(dayLabel('nope', 'es', TZ, NOW)).toBe('')
  })
})

describe('seguimientoView', () => {
  it('formats the interview card from its local wall time, with editor values', () => {
    const view = buildThread({
      outcomes: [
        {
          id: 'o1',
          at: '2026-10-14T18:00:00.000Z',
          type: 'interview',
          note: 'gmail:m1 «confirmo tu entrevista»',
          // 10:00 in Mexico City.
          scheduledAt: '2026-10-20T16:00:00.000Z',
        },
      ],
      mail: [
        {
          messageId: 'm1',
          at: '2026-10-14T18:00:00.000Z',
          from: 'rh@haldenco.com',
          subject: 'Confirmación Entrevista',
          kind: 'interview',
          eventAt: '2026-10-20T16:00:00.000Z',
          handledAs: 'outcome',
          source: 'live',
        },
      ],
      drafts: [],
      account: 'me@gmail.com',
      now: NOW,
      timeZone: TZ,
    })
    const v = seguimientoView({ view, company: 'Halden', locale: 'es', timeZone: TZ, now: NOW })
    expect(v.interview).toMatchObject({
      state: 'scheduled',
      month: 'oct',
      day: 20,
      weekday: 'martes',
      daysFromToday: 4,
      source: 'agent',
      inputDate: '2026-10-20',
      inputTime: '10:00',
    })
    expect(v.interview?.state === 'scheduled' && v.interview.time).toMatch(/^10:00/)
    expect(v.cards[0]).toMatchObject({
      kind: 'event',
      chip: 'interview',
      date: '14 oct',
      from: 'Halden · haldenco.com',
      quote: 'confirmo tu entrevista',
      outcomeId: 'o1',
    })
  })

  it('a plain email carries no quote and no undo', () => {
    const view = buildThread({
      outcomes: [],
      mail: [
        {
          messageId: 'h1',
          at: '2026-10-07T18:00:00.000Z',
          from: 'Talent <talent@successfactors.com>',
          subject: 'Welcome',
          kind: '',
          eventAt: null,
          handledAs: null,
          source: 'history',
        },
      ],
      drafts: [],
      account: null,
      now: NOW,
      timeZone: TZ,
    })
    const v = seguimientoView({ view, company: 'Halden', locale: 'en', timeZone: TZ, now: NOW })
    expect(v.cards[0]).toMatchObject({ kind: 'mail', chip: 'mail', quote: '', outcomeId: null })
    expect(v.interview).toBeNull()
  })
})

describe('seguimientoView — a date-only interview', () => {
  it('keeps no time anywhere: the editor time is empty, the source unclaimed', () => {
    const view = buildThread({
      outcomes: [
        {
          id: 'o1',
          at: '2026-10-14T18:00:00.000Z',
          type: 'screen',
          note: null,
          scheduledAt: '2026-10-20',
        },
      ],
      mail: [],
      drafts: [],
      account: null,
      now: NOW,
      timeZone: TZ,
    })
    const v = seguimientoView({ view, company: 'Halden', locale: 'es', timeZone: TZ, now: NOW })
    expect(v.interview).toMatchObject({
      state: 'scheduled',
      kind: 'screen',
      time: null,
      weekday: 'martes',
      longDate: 'martes, 20 de octubre',
      inputDate: '2026-10-20',
      inputTime: '',
      source: null,
      daysFromToday: 4,
    })
  })
})
