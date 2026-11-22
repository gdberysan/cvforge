import { describe, expect, it } from 'vitest'
import { appendOutcome, listOutcomes } from '@/lib/db/queries/applications'
import {
  attachInvite,
  hidePerson,
  listPeople,
  saveManualPerson,
  setMeetingUrl,
  upsertAgentPeople,
} from '@/lib/db/queries/people'
import { seedApp, withDb } from '../support/db-app'
import { must } from '../support/must'

describe('people on an application', () => {
  it('upserts by email case-insensitively and fills a role only from a non-empty newer quote', () => {
    withDb((db) => {
      const a = seedApp(db)
      upsertAgentPeople(db, a, null, [
        { name: 'Marco Ibarra', email: 'marco.ibarra@x.com', source: 'invite' },
      ])
      upsertAgentPeople(db, a, null, [
        {
          name: 'Marco Ibarra',
          email: 'marco.ibarra@x.com',
          role: 'eComm Strategy & Planning Sr. Manager',
          roleQuote: 'tu entrevista con Marco Ibarra, eComm Strategy & Planning Sr. Manager',
          source: 'mail',
        },
      ])
      upsertAgentPeople(db, a, null, [
        { name: 'Marco Ibarra', email: 'MARCO.IBARRA@x.com', role: '', source: 'invite' },
      ])
      const people = listPeople(db, a)
      expect(people).toHaveLength(1)
      expect(people[0]?.role).toBe('eComm Strategy & Planning Sr. Manager')
      expect(people[0]?.roleQuote).toContain('Sr. Manager')
    })
  })

  it('never changes a manual row from the agent', () => {
    withDb((db) => {
      const a = seedApp(db)
      saveManualPerson(db, a, { name: 'Marco Ibarra', email: 'r@x.com', role: 'Hiring manager' })
      upsertAgentPeople(db, a, null, [
        {
          name: 'Marco Ibarra',
          email: 'r@x.com',
          role: 'Director',
          roleQuote: 'Marco Ibarra, Director',
          source: 'mail',
        },
      ])
      expect(listPeople(db, a).map((p) => [p.role, p.source])).toEqual([
        ['Hiring manager', 'manual'],
      ])
    })
  })

  it('keeps a hidden person from coming back', () => {
    withDb((db) => {
      const a = seedApp(db)
      upsertAgentPeople(db, a, null, [{ name: 'Room 4', email: 'room4@x.com', source: 'invite' }])
      const [p] = listPeople(db, a)
      hidePerson(db, a, must(p, 'person').id)
      upsertAgentPeople(db, a, null, [{ name: 'Room 4', email: 'room4@x.com', source: 'invite' }])
      expect(listPeople(db, a)).toEqual([])
    })
  })

  it('matches by folded name when there is no email', () => {
    withDb((db) => {
      const a = seedApp(db)
      upsertAgentPeople(db, a, null, [{ name: 'Ibarra, Marco', email: '', source: 'invite' }])
      upsertAgentPeople(db, a, null, [
        {
          name: 'marco ibárra',
          email: '',
          role: 'Sr. Manager',
          roleQuote: 'Marco Ibarra, Sr. Manager',
          source: 'mail',
        },
      ])
      const people = listPeople(db, a)
      expect(people).toHaveLength(1)
      expect(people[0]?.role).toBe('Sr. Manager')
    })
  })

  it('lists the people of one event, else all', () => {
    withDb((db) => {
      const a = seedApp(db)
      const ev = appendOutcome(db, a, { at: '2026-10-16T12:00:00.000Z', type: 'interview' })
      upsertAgentPeople(db, a, ev, [{ name: 'Ana', email: 'ana@x.com', source: 'invite' }])
      upsertAgentPeople(db, a, null, [{ name: 'Bo', email: 'bo@x.com', source: 'invite' }])
      expect(listPeople(db, a, ev).map((p) => p.name)).toEqual(['Ana'])
      expect(
        listPeople(db, a)
          .map((p) => p.name)
          .sort(),
      ).toEqual(['Ana', 'Bo'])
    })
  })

  it('a person he added by hand shows beside the call’s invite people (final review #4)', () => {
    withDb((db) => {
      const a = seedApp(db)
      const ev = appendOutcome(db, a, { at: '2026-10-16T12:00:00.000Z', type: 'interview' })
      upsertAgentPeople(db, a, ev, [{ name: 'Marco Ibarra', email: 'r@x.com', source: 'invite' }])
      saveManualPerson(db, a, { name: 'Ana Ruiz', email: '', role: 'RR.HH.' })
      expect(listPeople(db, a, ev).map((p) => p.name)).toEqual(['Marco Ibarra', 'Ana Ruiz'])
    })
  })

  it('stores a meeting link on the event', () => {
    withDb((db) => {
      const a = seedApp(db)
      const ev = appendOutcome(db, a, { at: '2026-10-16T12:00:00.000Z', type: 'interview' })
      expect(setMeetingUrl(db, a, ev, 'https://teams.microsoft.com/l/meetup-join/x')).toBe(true)
      expect(listOutcomes(db, a).find((o) => o.id === ev)?.meetingUrl).toBe(
        'https://teams.microsoft.com/l/meetup-join/x',
      )
    })
  })
})

describe('attachInvite', () => {
  const people = [{ name: 'Marco Ibarra', email: 'marco@acme.example' }]
  const link = 'https://teams.microsoft.com/l/meetup-join/x'

  it('attaches to the call at the same instant, sets its link, and never replaces a link', () => {
    withDb((db) => {
      const a = seedApp(db)
      appendOutcome(db, a, {
        at: '2026-10-10T00:00:00.000Z',
        type: 'screen',
        scheduledAt: '2026-10-12',
      })
      const call = appendOutcome(db, a, {
        at: '2026-10-16T12:00:00.000Z',
        type: 'interview',
        scheduledAt: '2026-10-20T16:45:00.000Z',
      })
      expect(
        attachInvite(db, a, { start: '2026-10-20T16:45:00.000Z', people, meetingUrl: link }),
      ).toEqual({
        eventId: call,
        people: 1,
      })
      expect(listPeople(db, a, call).map((p) => p.name)).toEqual(['Marco Ibarra'])
      expect(listOutcomes(db, a).find((o) => o.id === call)?.meetingUrl).toBe(link)
      attachInvite(db, a, {
        start: '2026-10-20T16:45:00.000Z',
        people,
        meetingUrl: 'https://meet.google.com/zzz',
      })
      expect(listOutcomes(db, a).find((o) => o.id === call)?.meetingUrl).toBe(link)
    })
  })

  it('matches the same instant however it is written', () => {
    withDb((db) => {
      const a = seedApp(db)
      const call = appendOutcome(db, a, {
        at: '2026-10-16T12:00:00.000Z',
        type: 'interview',
        scheduledAt: '2026-10-20T10:45:00-06:00',
      })
      expect(
        attachInvite(db, a, { start: '2026-10-20T16:45:00.000Z', people, meetingUrl: link })
          .eventId,
      ).toBe(call)
      expect(listOutcomes(db, a).find((o) => o.id === call)?.meetingUrl).toBe(link)
    })
  })

  it('matches a date-only call by its day', () => {
    withDb((db) => {
      const a = seedApp(db)
      const call = appendOutcome(db, a, {
        at: '2026-10-16T12:00:00.000Z',
        type: 'interview',
        scheduledAt: '2026-10-20',
      })
      expect(
        attachInvite(db, a, { start: '2026-10-20T16:45:00.000Z', people, meetingUrl: null })
          .eventId,
      ).toBe(call)
    })
  })

  it('reads an invite’s day where the user is, not in UTC', () => {
    withDb((db) => {
      const a = seedApp(db)
      const mx = 'America/Mexico_City'
      const tue = appendOutcome(db, a, {
        at: '2026-10-16T12:00:00.000Z',
        type: 'interview',
        scheduledAt: '2026-10-20',
      })
      const wed = appendOutcome(db, a, {
        at: '2026-10-16T12:00:00.000Z',
        type: 'interview',
        scheduledAt: '2026-10-21',
      })
      // 19:30 on Tuesday in Mexico City is already Wednesday in UTC.
      const invite = { start: '2026-10-21T01:30:00.000Z', people, meetingUrl: link }
      expect(attachInvite(db, a, invite, Date.now(), mx).eventId).toBe(tue)
      expect(listOutcomes(db, a).find((o) => o.id === wed)?.meetingUrl).toBeNull()
    })
  })

  it('falls back to the newest call without a link, else to the application alone', () => {
    withDb((db) => {
      const a = seedApp(db)
      expect(attachInvite(db, a, { start: null, people, meetingUrl: link }).eventId).toBeNull()
      expect(listPeople(db, a).map((p) => p.name)).toEqual(['Marco Ibarra'])
      const call = appendOutcome(db, a, { at: '2026-10-16T12:00:00.000Z', type: 'interview' })
      expect(
        attachInvite(db, a, { start: '2026-10-20T16:45:00.000Z', people, meetingUrl: link })
          .eventId,
      ).toBe(call)
    })
  })

  it('never hangs an invite on an untimed call logged weeks before its time — that is another meeting', () => {
    withDb((db) => {
      const a = seedApp(db)
      appendOutcome(db, a, {
        at: '2026-10-16T12:00:00.000Z',
        type: 'interview',
        scheduledAt: '2026-10-20T16:45:00.000Z',
      })
      // An untimed interview row from right after that call (a second tap, an
      // email that gave no time), then an invite for a meeting two weeks on.
      const stray = appendOutcome(db, a, { at: '2026-10-21T09:11:00.000Z', type: 'interview' })
      const r = attachInvite(db, a, {
        start: '2026-11-04T17:00:00.000Z',
        people: [{ name: 'Ana Ruiz', email: 'ana@acme.example' }],
        meetingUrl: link,
      })
      expect(r.eventId).toBeNull()
      expect(listOutcomes(db, a).find((o) => o.id === stray)?.meetingUrl).toBeNull()
      expect(listPeople(db, a).find((p) => p.name === 'Ana Ruiz')?.outcomeEventId).toBeNull()
    })
  })

  it('never puts a new interview’s link on an earlier call that has another time (final review #3)', () => {
    withDb((db) => {
      const a = seedApp(db)
      const screen = appendOutcome(db, a, {
        at: '2026-10-10T00:00:00.000Z',
        type: 'screen',
        scheduledAt: '2026-10-12',
      })
      const r = attachInvite(db, a, { start: '2026-10-20T16:45:00.000Z', people, meetingUrl: link })
      expect(r.eventId).toBeNull()
      expect(listOutcomes(db, a).find((o) => o.id === screen)?.meetingUrl).toBeNull()
    })
  })
})
