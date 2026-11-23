import { describe, expect, it } from 'vitest'
import {
  type BuildThreadInput,
  buildThread,
  gmailLink,
  senderOf,
  type ThreadOutcome,
} from '@/lib/mail-thread'
import type { MailThreadItem } from '@/lib/satellite/mail'

const NOW = Date.parse('2026-10-16T15:00:00.000Z') // 09:00 in Mexico City (UTC-6, no DST)
const TZ = 'America/Mexico_City'

const out = (
  o: Partial<ThreadOutcome> & Pick<ThreadOutcome, 'id' | 'at' | 'type'>,
): ThreadOutcome => ({
  note: null,
  scheduledAt: null,
  ...o,
})
const gmailOut = (
  id: string,
  messageId: string,
  at: string,
  type: ThreadOutcome['type'],
  quote = 'q',
  scheduledAt: string | null = null,
): ThreadOutcome => ({ id, at, type, note: `gmail:${messageId} «${quote}»`, scheduledAt })

const mail = (
  m: Partial<MailThreadItem> & Pick<MailThreadItem, 'messageId' | 'at'>,
): MailThreadItem => ({
  from: 'Acme Talent <jobs@acme.com>',
  subject: 'Subject',
  kind: '',
  eventAt: null,
  handledAs: 'none',
  source: 'live',
  ...m,
})

const input = (p: Partial<BuildThreadInput>): BuildThreadInput => ({
  outcomes: [],
  mail: [],
  drafts: [],
  account: null,
  now: NOW,
  timeZone: TZ,
  ...p,
})

describe('senderOf', () => {
  it('shows the display name and the domain', () => {
    expect(senderOf('"Acme Talent" <Jobs@Mail.Acme.com>')).toEqual({
      name: 'Acme Talent',
      domain: 'mail.acme.com',
      label: 'Acme Talent · mail.acme.com',
    })
  })
  it('falls back to the domain alone for a bare address (the live pass stores those)', () => {
    expect(senderOf('no-reply@greenhouse.io')).toEqual({
      name: null,
      domain: 'greenhouse.io',
      label: 'greenhouse.io',
    })
  })
  it('treats a name that is just the address as no name', () => {
    expect(senderOf('"jobs@acme.com" <jobs@acme.com>')?.name).toBeNull()
  })
  it('keeps whatever it cannot parse, and null for nothing', () => {
    expect(senderOf('Acme')).toEqual({ name: null, domain: '', label: 'Acme' })
    expect(senderOf('   ')).toBeNull()
  })
})

describe('gmailLink', () => {
  it('names the account when known', () => {
    expect(gmailLink('18f2a', 'ana+jobs@gmail.com')).toBe(
      'https://mail.google.com/mail/?authuser=ana%2Bjobs%40gmail.com#all/18f2a',
    )
  })
  it('omits it when not', () => {
    expect(gmailLink('18f2a', null)).toBe('https://mail.google.com/mail/#all/18f2a')
  })
})

describe('buildThread — event cards', () => {
  it('makes one card per gmail outcome with its mail row, quote, link and undo id', () => {
    const v = buildThread(
      input({
        outcomes: [
          gmailOut(
            'o1',
            'm1',
            '2026-10-10T12:00:00.000Z',
            'acknowledged',
            'Recibimos tu solicitud',
          ),
        ],
        mail: [
          mail({
            messageId: 'm1',
            at: '2026-10-10T12:00:00.000Z',
            subject: 'Gracias',
            handledAs: 'outcome',
            kind: 'acknowledged',
          }),
        ],
        account: 'g@gmail.com',
      }),
    )
    expect(v.cards).toEqual([
      {
        type: 'event',
        key: 'm1',
        messageId: 'm1',
        outcomeId: 'o1',
        chip: 'acknowledged',
        at: '2026-10-10T12:00:00.000Z',
        quote: 'Recibimos tu solicitud',
        subject: 'Gracias',
        sender: { name: 'Acme Talent', domain: 'acme.com', label: 'Acme Talent · acme.com' },
        link: 'https://mail.google.com/mail/?authuser=g%40gmail.com#all/m1',
        folded: [],
      },
    ])
    expect(v.count).toBe(1)
  })

  it('still shows an event whose mail row is missing, without subject or sender', () => {
    const v = buildThread(
      input({ outcomes: [gmailOut('o1', 'm1', '2026-10-10T12:00:00.000Z', 'rejected')] }),
    )
    expect(v.cards).toMatchObject([
      { type: 'event', subject: null, sender: null, link: 'https://mail.google.com/mail/#all/m1' },
    ])
  })

  it('takes subject and sender from a history row when the live row is absent', () => {
    const v = buildThread(
      input({
        outcomes: [gmailOut('o1', 'm1', '2026-10-10T12:00:00.000Z', 'rejected')],
        mail: [
          mail({
            messageId: 'm1',
            at: '2026-10-10T12:00:00.000Z',
            subject: 'Update',
            source: 'history',
            handledAs: null,
          }),
        ],
      }),
    )
    expect(v.cards).toHaveLength(1)
    expect(v.cards[0]).toMatchObject({ type: 'event', subject: 'Update' })
  })
})

describe('buildThread — folding duplicates', () => {
  const events = [
    gmailOut('o1', 'm1', '2026-10-01T12:00:00.000Z', 'screen'),
    gmailOut('o2', 'm2', '2026-10-05T12:00:00.000Z', 'rejected'),
  ]

  it('folds a duplicate into the same-kind event, screen ≈ interview', () => {
    const v = buildThread(
      input({
        outcomes: events,
        mail: [
          mail({
            messageId: 'd1',
            at: '2026-10-03T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: 'interview',
            subject: 'Invite',
          }),
        ],
      }),
    )
    expect(v.cards.map((c) => c.key)).toEqual(['m2', 'm1'])
    const screen = v.cards[1]
    expect(screen?.folded).toEqual([
      {
        messageId: 'd1',
        at: '2026-10-03T12:00:00.000Z',
        subject: 'Invite',
        sender: { name: 'Acme Talent', domain: 'acme.com', label: 'Acme Talent · acme.com' },
        link: 'https://mail.google.com/mail/#all/d1',
      },
    ])
    expect(v.count).toBe(3)
  })

  it('picks the latest matching event at or before the duplicate', () => {
    const v = buildThread(
      input({
        outcomes: [
          gmailOut('o1', 'm1', '2026-10-01T12:00:00.000Z', 'interview'),
          gmailOut('o3', 'm3', '2026-10-08T12:00:00.000Z', 'interview'),
          gmailOut('o4', 'm4', '2026-10-12T12:00:00.000Z', 'interview'),
        ],
        mail: [
          mail({
            messageId: 'd1',
            at: '2026-10-09T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: 'interview',
          }),
        ],
      }),
    )
    expect(v.cards.find((c) => c.key === 'm3')?.folded.map((f) => f.messageId)).toEqual(['d1'])
    expect(v.cards.find((c) => c.key === 'm1')?.folded).toEqual([])
    expect(v.cards.find((c) => c.key === 'm4')?.folded).toEqual([])
  })

  it('folds a duplicate dated the same instant as the event (≤, not <)', () => {
    const v = buildThread(
      input({
        outcomes: [gmailOut('o1', 'm1', '2026-10-01T12:00:00.000Z', 'rejected')],
        mail: [
          mail({
            messageId: 'd1',
            at: '2026-10-01T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: 'rejected',
          }),
        ],
      }),
    )
    expect(v.cards).toHaveLength(1)
    expect(v.cards[0]?.folded).toHaveLength(1)
  })

  it('folds at exactly 14 days and not one minute past', () => {
    const at = '2026-10-01T12:00:00.000Z'
    const v = buildThread(
      input({
        outcomes: [gmailOut('o1', 'm1', at, 'offer')],
        mail: [
          mail({
            messageId: 'd14',
            at: '2026-10-15T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: 'offer',
          }),
          mail({
            messageId: 'd15',
            at: '2026-10-15T12:01:00.000Z',
            handledAs: 'duplicate',
            kind: 'offer',
          }),
        ],
      }),
    )
    expect(v.cards.find((c) => c.key === 'm1')?.folded.map((f) => f.messageId)).toEqual(['d14'])
    expect(v.cards.find((c) => c.key === 'd15')).toMatchObject({ type: 'mail', chip: 'mail' })
    expect(v.count).toBe(3)
  })

  it('never folds into a different kind or a later event: an orphan duplicate is a plain card', () => {
    const v = buildThread(
      input({
        outcomes: [
          gmailOut('o1', 'm1', '2026-10-01T12:00:00.000Z', 'rejected'),
          gmailOut('o2', 'm2', '2026-10-10T12:00:00.000Z', 'interview'),
        ],
        mail: [
          mail({
            messageId: 'd1',
            at: '2026-10-05T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: 'interview',
          }),
          mail({
            messageId: 'd2',
            at: '2026-10-06T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: '',
          }),
        ],
      }),
    )
    expect(v.cards.map((c) => [c.key, c.type, c.folded.length])).toEqual([
      ['m2', 'event', 0],
      ['d2', 'mail', 0],
      ['d1', 'mail', 0],
      ['m1', 'event', 0],
    ])
  })

  it('does not fold into an outcome the user logged by hand', () => {
    const v = buildThread(
      input({
        outcomes: [out({ id: 'u1', at: '2026-10-01T12:00:00.000Z', type: 'interview' })],
        mail: [
          mail({
            messageId: 'd1',
            at: '2026-10-02T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: 'interview',
          }),
        ],
      }),
    )
    expect(v.cards).toMatchObject([{ key: 'd1', type: 'mail' }])
  })

  it('lists folded mail newest first', () => {
    const v = buildThread(
      input({
        outcomes: [gmailOut('o1', 'm1', '2026-10-01T12:00:00.000Z', 'interview')],
        mail: [
          mail({
            messageId: 'd1',
            at: '2026-10-02T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: 'screen',
          }),
          mail({
            messageId: 'd2',
            at: '2026-10-04T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: 'interview',
          }),
        ],
      }),
    )
    expect(v.cards[0]?.folded.map((f) => f.messageId)).toEqual(['d2', 'd1'])
    expect(v.count).toBe(3)
  })
})

describe('buildThread — plain mail cards', () => {
  it('shows none and history rows as neutral mail cards without a quote', () => {
    const v = buildThread(
      input({
        mail: [
          mail({
            messageId: 'n1',
            at: '2026-10-02T12:00:00.000Z',
            subject: 'Welcome to the Talent Community',
            kind: 'none',
          }),
          mail({
            messageId: 'h1',
            at: '2026-09-20T12:00:00.000Z',
            subject: 'Application received',
            source: 'history',
            handledAs: null,
          }),
        ],
        account: 'g@gmail.com',
      }),
    )
    expect(v.cards).toEqual([
      {
        type: 'mail',
        key: 'n1',
        messageId: 'n1',
        chip: 'mail',
        at: '2026-10-02T12:00:00.000Z',
        subject: 'Welcome to the Talent Community',
        sender: { name: 'Acme Talent', domain: 'acme.com', label: 'Acme Talent · acme.com' },
        link: 'https://mail.google.com/mail/?authuser=g%40gmail.com#all/n1',
        source: 'live',
        folded: [],
      },
      expect.objectContaining({ key: 'h1', type: 'mail', source: 'history' }),
    ])
    expect(v.count).toBe(2)
  })

  it('shows a message once even when it is both live and history', () => {
    const v = buildThread(
      input({
        mail: [
          mail({
            messageId: 'x',
            at: '2026-10-02T12:00:00.000Z',
            source: 'history',
            handledAs: null,
            subject: 'H',
          }),
          mail({ messageId: 'x', at: '2026-10-02T12:00:00.000Z', subject: 'L' }),
        ],
      }),
    )
    expect(v.cards).toHaveLength(1)
    expect(v.cards[0]).toMatchObject({ subject: 'L', source: 'live' })
  })

  it('keeps an outcome-handled row whose outcome was undone as a plain card', () => {
    const v = buildThread(
      input({
        mail: [
          mail({
            messageId: 'm9',
            at: '2026-10-02T12:00:00.000Z',
            handledAs: 'outcome',
            kind: 'rejected',
          }),
        ],
      }),
    )
    expect(v.cards).toMatchObject([{ type: 'mail', chip: 'mail', key: 'm9' }])
  })

  it('sorts every card newest first and counts each email once', () => {
    const v = buildThread(
      input({
        outcomes: [gmailOut('o1', 'm1', '2026-10-05T12:00:00.000Z', 'acknowledged')],
        mail: [
          mail({
            messageId: 'm1',
            at: '2026-10-05T12:00:00.000Z',
            handledAs: 'outcome',
            kind: 'acknowledged',
          }),
          mail({ messageId: 'a', at: '2026-10-01T12:00:00.000Z' }),
          mail({ messageId: 'b', at: '2026-10-09T12:00:00.000Z' }),
          mail({
            messageId: 'c',
            at: '2026-09-01T12:00:00.000Z',
            source: 'history',
            handledAs: null,
          }),
        ],
      }),
    )
    expect(v.cards.map((c) => c.key)).toEqual(['b', 'm1', 'a', 'c'])
    expect(v.count).toBe(4)
  })

  it('is empty for no mail at all', () => {
    expect(buildThread(input({}))).toEqual({ cards: [], count: 0, you: [], interview: null })
  })
})

describe('buildThread — Tú', () => {
  it('lists the application, used follow-ups and hand-logged outcomes, newest first; never mail outcomes', () => {
    const v = buildThread(
      input({
        outcomes: [
          out({ id: 'a1', at: '2026-10-01T12:00:00.000Z', type: 'applied' }),
          gmailOut('g1', 'm1', '2026-10-03T12:00:00.000Z', 'acknowledged'),
          out({ id: 'u1', at: '2026-10-09T12:00:00.000Z', type: 'screen', note: 'Llamada con RH' }),
        ],
        drafts: [
          { id: 'd1', usedAt: '2026-10-07T12:00:00.000Z' },
          { id: 'd2', usedAt: null },
        ],
      }),
    )
    expect(v.you).toEqual([
      {
        key: 'u1',
        kind: 'outcome',
        at: '2026-10-09T12:00:00.000Z',
        type: 'screen',
        outcomeId: 'u1',
        draftId: null,
        note: 'Llamada con RH',
      },
      {
        key: 'd1',
        kind: 'followUp',
        at: '2026-10-07T12:00:00.000Z',
        type: null,
        outcomeId: null,
        draftId: 'd1',
        note: null,
      },
      {
        key: 'a1',
        kind: 'applied',
        at: '2026-10-01T12:00:00.000Z',
        type: 'applied',
        outcomeId: 'a1',
        draftId: null,
        note: null,
      },
    ])
  })
})

describe('buildThread — interview card', () => {
  it('shows the soonest upcoming, in the user zone, from the calendar invite', () => {
    const v = buildThread(
      input({
        outcomes: [
          gmailOut(
            'g1',
            'm1',
            '2026-10-10T12:00:00.000Z',
            'interview',
            'q',
            '2026-10-21T17:30:00.000Z',
          ),
          out({
            id: 'u1',
            at: '2026-10-12T12:00:00.000Z',
            type: 'screen',
            scheduledAt: '2026-10-19',
          }),
        ],
        mail: [
          mail({
            messageId: 'm1',
            at: '2026-10-10T12:00:00.000Z',
            handledAs: 'outcome',
            kind: 'interview',
            eventAt: '2026-10-21T17:30:00.000Z',
          }),
        ],
      }),
    )
    expect(v.interview).toEqual({
      state: 'scheduled',
      outcomeId: 'u1',
      kind: 'screen',
      scheduledAt: '2026-10-19',
      date: '2026-10-19',
      time: null,
      year: 2026,
      month: 10,
      day: 19,
      weekday: 1,
      daysFromToday: 3,
      // A typed date-only value no invite carries: provenance unknown, unsaid.
      source: null,
    })
  })

  it('converts a UTC time to the local day and time, and credits the invite', () => {
    const v = buildThread(
      input({
        outcomes: [
          gmailOut(
            'g1',
            'm1',
            '2026-10-10T12:00:00.000Z',
            'interview',
            'q',
            '2026-10-17T01:30:00.000Z',
          ),
        ],
        mail: [
          mail({
            messageId: 'm1',
            at: '2026-10-10T12:00:00.000Z',
            handledAs: 'outcome',
            eventAt: '2026-10-17T01:30:00Z',
          }),
        ],
      }),
    )
    // 01:30 UTC on the 17th is 19:30 on the 16th in Mexico City: today.
    expect(v.interview).toMatchObject({
      date: '2026-10-16',
      time: '19:30',
      weekday: 5,
      daysFromToday: 0,
      source: 'agent',
    })
  })

  it('credits an invite read from a duplicate folded into the event', () => {
    const v = buildThread(
      input({
        outcomes: [
          gmailOut(
            'g1',
            'm1',
            '2026-10-10T12:00:00.000Z',
            'screen',
            'q',
            '2026-10-20T16:00:00.000Z',
          ),
        ],
        mail: [
          mail({
            messageId: 'm1',
            at: '2026-10-10T12:00:00.000Z',
            handledAs: 'outcome',
            kind: 'screen',
          }),
          mail({
            messageId: 'd1',
            at: '2026-10-11T12:00:00.000Z',
            handledAs: 'duplicate',
            kind: 'interview',
            eventAt: '2026-10-20T16:00:00.000Z',
          }),
        ],
      }),
    )
    expect(v.interview).toMatchObject({ source: 'agent', time: '10:00' })
  })

  it('claims no source when a mail outcome carries a time no invite gave (he edited it)', () => {
    const v = buildThread(
      input({
        outcomes: [
          gmailOut(
            'g1',
            'm1',
            '2026-10-10T12:00:00.000Z',
            'interview',
            'q',
            '2026-10-20T18:00:00.000Z',
          ),
        ],
        mail: [
          mail({
            messageId: 'm1',
            at: '2026-10-10T12:00:00.000Z',
            handledAs: 'outcome',
            eventAt: '2026-10-20T16:00:00.000Z',
          }),
        ],
      }),
    )
    expect(v.interview).toMatchObject({ source: null })
  })

  it('claims no source when the agent is off: an invite time with no mail rows is not "his"', () => {
    const v = buildThread(
      input({
        outcomes: [
          gmailOut(
            'g1',
            'm1',
            '2026-10-10T12:00:00.000Z',
            'interview',
            'q',
            '2026-10-20T16:00:00.000Z',
          ),
        ],
        mail: [],
      }),
    )
    expect(v.interview).toMatchObject({ state: 'scheduled', source: null })
  })

  it('credits the agent when any email of this application carries exactly that time', () => {
    const v = buildThread(
      input({
        outcomes: [
          out({
            id: 'u1',
            at: '2026-10-12T12:00:00.000Z',
            type: 'interview',
            scheduledAt: '2026-10-20T16:00:00.000Z',
          }),
        ],
        mail: [
          mail({
            messageId: 'h1',
            at: '2026-10-11T12:00:00.000Z',
            handledAs: null,
            source: 'history',
            eventAt: '2026-10-20T16:00:00.000Z',
          }),
        ],
      }),
    )
    expect(v.interview).toMatchObject({ source: 'agent' })
  })

  it('falls back to the latest past one within two days', () => {
    const v = buildThread(
      input({
        outcomes: [
          out({
            id: 'u1',
            at: '2026-10-01T12:00:00.000Z',
            type: 'screen',
            scheduledAt: '2026-10-14T16:00:00.000Z',
          }),
          out({
            id: 'u2',
            at: '2026-10-02T12:00:00.000Z',
            type: 'interview',
            scheduledAt: '2026-10-15T16:00:00.000Z',
          }),
          out({
            id: 'u3',
            at: '2026-10-03T12:00:00.000Z',
            type: 'interview',
            scheduledAt: '2026-10-10T16:00:00.000Z',
          }),
        ],
      }),
    )
    expect(v.interview).toMatchObject({ state: 'scheduled', outcomeId: 'u2', daysFromToday: -1 })
  })

  it('shows nothing for one three days past, and no prompt since it has a date', () => {
    const v = buildThread(
      input({
        outcomes: [
          out({
            id: 'u1',
            at: '2026-10-01T12:00:00.000Z',
            type: 'interview',
            scheduledAt: '2026-10-13',
          }),
        ],
      }),
    )
    expect(v.interview).toBeNull()
  })

  it('asks for the date when the latest interview has none', () => {
    const v = buildThread(
      input({
        outcomes: [
          out({
            id: 'u1',
            at: '2026-10-01T12:00:00.000Z',
            type: 'screen',
            scheduledAt: '2026-10-02',
          }),
          gmailOut('g2', 'm2', '2026-10-12T12:00:00.000Z', 'interview'),
        ],
      }),
    )
    expect(v.interview).toEqual({ state: 'prompt', outcomeId: 'g2', kind: 'interview' })
  })

  it('does not ask once the process ended after that interview', () => {
    const v = buildThread(
      input({
        outcomes: [
          out({ id: 'u1', at: '2026-10-01T12:00:00.000Z', type: 'interview' }),
          out({ id: 'u2', at: '2026-10-05T12:00:00.000Z', type: 'rejected' }),
        ],
      }),
    )
    expect(v.interview).toBeNull()
  })

  it('prefers an upcoming date over a prompt', () => {
    const v = buildThread(
      input({
        outcomes: [
          out({
            id: 'u1',
            at: '2026-10-01T12:00:00.000Z',
            type: 'screen',
            scheduledAt: '2026-10-30',
          }),
          out({ id: 'u2', at: '2026-10-05T12:00:00.000Z', type: 'interview' }),
        ],
      }),
    )
    expect(v.interview).toMatchObject({ state: 'scheduled', outcomeId: 'u1' })
  })

  it('ignores a time on a non-interview outcome and a garbled value', () => {
    const v = buildThread(
      input({
        outcomes: [
          out({
            id: 'u1',
            at: '2026-10-01T12:00:00.000Z',
            type: 'offer',
            scheduledAt: '2026-10-20',
          }),
          out({
            id: 'u2',
            at: '2026-10-02T12:00:00.000Z',
            type: 'interview',
            scheduledAt: 'next tuesday',
          }),
        ],
      }),
    )
    expect(v.interview).toEqual({ state: 'prompt', outcomeId: 'u2', kind: 'interview' })
  })

  it('judges "today" in the user zone, not UTC', () => {
    // 2026-10-17T03:00Z is still the 16th in Mexico City, already the 17th in Madrid.
    const now = Date.parse('2026-10-17T03:00:00.000Z')
    const outcomes = [
      out({
        id: 'u1',
        at: '2026-10-01T12:00:00.000Z',
        type: 'interview',
        scheduledAt: '2026-10-16',
      }),
    ]
    expect(buildThread(input({ outcomes, now })).interview).toMatchObject({ daysFromToday: 0 })
    expect(
      buildThread(input({ outcomes, now, timeZone: 'Europe/Madrid' })).interview,
    ).toMatchObject({
      daysFromToday: -1,
    })
  })

  it('reads an unknown zone as UTC instead of throwing', () => {
    const outcomes = [
      out({
        id: 'u1',
        at: '2026-10-01T12:00:00.000Z',
        type: 'interview',
        scheduledAt: '2026-10-17T01:30:00.000Z',
      }),
    ]
    expect(buildThread(input({ outcomes, timeZone: 'Mars/Olympus' })).interview).toMatchObject({
      date: '2026-10-17',
      time: '01:30',
      daysFromToday: 1,
    })
  })
})

describe('buildThread — a closed process shows no call ahead', () => {
  const call = out({
    id: 'u1',
    at: '2026-10-10T12:00:00.000Z',
    type: 'interview',
    scheduledAt: '2026-10-20T17:00:00.000Z',
  })

  it('a rejection logged after the call was booked takes the upcoming tile away', () => {
    const v = buildThread(
      input({
        outcomes: [call, out({ id: 'r1', at: '2026-10-12T12:00:00.000Z', type: 'rejected' })],
      }),
    )
    expect(v.interview).toBeNull()
  })

  it('a rejection from before the call was booked does not', () => {
    const v = buildThread(
      input({
        outcomes: [out({ id: 'r0', at: '2026-10-05T12:00:00.000Z', type: 'rejected' }), call],
      }),
    )
    expect(v.interview).toMatchObject({ state: 'scheduled', outcomeId: 'u1' })
  })
})

describe('buildThread — every agent outcome is reachable', () => {
  it('two outcomes on one message id each get a card and an Undo; the email counts once', () => {
    const v = buildThread(
      input({
        outcomes: [
          gmailOut('g1', 'm1', '2026-10-10T12:00:00.000Z', 'acknowledged'),
          gmailOut('g2', 'm1', '2026-10-11T12:00:00.000Z', 'screen'),
        ],
        mail: [mail({ messageId: 'm1', at: '2026-10-10T12:00:00.000Z', handledAs: 'outcome' })],
      }),
    )
    const events = v.cards.flatMap((c) => (c.type === 'event' ? [c] : []))
    expect(events.map((e) => e.outcomeId).sort()).toEqual(['g1', 'g2'])
    expect(new Set(v.cards.map((c) => c.key)).size).toBe(v.cards.length)
    expect(v.count).toBe(1)
    expect(v.you).toEqual([])
  })
})
