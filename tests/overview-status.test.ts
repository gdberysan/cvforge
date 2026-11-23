import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@/lib/i18n'
import { buildThread } from '@/lib/mail-thread'
import {
  attentionPrompt,
  calendarDaysSince,
  interviewOf as cardInterviewOf,
  cardStatus,
  hasUpcomingCall,
  nextMoveKey,
  type OverviewStatusInput,
  overviewStatus,
} from '@/lib/overview-status'
import type { OutcomeEvent } from '@/lib/schemas'

const NOW = Date.parse('2026-10-16T15:00:00.000Z')
const TZ = 'America/Mexico_City'
const es = makeTranslate('es')
const en = makeTranslate('en')

const base: OverviewStatusInput = {
  status: 'triaged',
  outcomes: [],
  interview: null,
  hasCv: false,
  createdAt: '2026-10-05 18:00:00',
  locale: 'es',
  timeZone: TZ,
  now: NOW,
}
const applied: OutcomeEvent = { at: '2026-10-07T14:00:00.000Z', type: 'applied' }

/** Seguimiento's own interview card, so both screens read one source. */
function interviewOf(outcomes: (OutcomeEvent & { id?: string })[]) {
  return buildThread({
    outcomes: outcomes.map((o, i) => ({
      id: o.id ?? `o${i}`,
      at: o.at,
      type: o.type,
      note: o.note ?? null,
      scheduledAt: o.scheduledAt ?? null,
    })),
    mail: [],
    drafts: [],
    account: null,
    now: NOW,
    timeZone: TZ,
  }).interview
}

describe('overviewStatus', () => {
  it('counts the silence since it was sent', () => {
    const line = overviewStatus(es, { ...base, status: 'applied', outcomes: [applied] })
    expect(line).toBe('Enviada el 7 oct · 9 días sin respuesta')
    expect(
      overviewStatus(en, { ...base, locale: 'en', status: 'applied', outcomes: [applied] }),
    ).toBe('Sent Oct 7 · 9 days without a reply')
  })

  it('says "today" rather than "0 days", and one day in the singular', () => {
    const today = { at: '2026-10-16T14:00:00.000Z', type: 'applied' as const }
    expect(overviewStatus(es, { ...base, status: 'applied', outcomes: [today] })).toBe(
      'Enviada hoy',
    )
    const yesterday = { at: '2026-10-15T14:00:00.000Z', type: 'applied' as const }
    expect(overviewStatus(es, { ...base, status: 'applied', outcomes: [yesterday] })).toBe(
      'Enviada el 15 oct · 1 día sin respuesta',
    )
  })

  it('names a reply once one is logged', () => {
    const outcomes: OutcomeEvent[] = [
      applied,
      { at: '2026-10-10T16:00:00.000Z', type: 'acknowledged' },
    ]
    expect(overviewStatus(es, { ...base, status: 'applied', outcomes })).toBe(
      'Respondieron el 10 oct',
    )
  })

  it('leads with a scheduled interview, in the shared call wording', () => {
    const outcomes: OutcomeEvent[] = [
      applied,
      { at: '2026-10-14T16:00:00.000Z', type: 'interview', scheduledAt: '2026-10-20' },
    ]
    const interview = interviewOf(outcomes)
    expect(overviewStatus(es, { ...base, status: 'interviewing', outcomes, interview })).toBe(
      'Entrevista · mar 20 oct · en\u00a04\u00a0días',
    )
    expect(
      overviewStatus(en, { ...base, locale: 'en', status: 'interviewing', outcomes, interview }),
    ).toBe('Interview · Tue, Oct 20 · in\u00a04\u00a0days')
  })

  it('reads a timed interview on its local day, and says nothing of a past one', () => {
    // 01:00 UTC on the 21st is still the 20th in Mexico City.
    const timed: OutcomeEvent[] = [
      {
        at: '2026-10-14T16:00:00.000Z',
        type: 'interview',
        scheduledAt: '2026-10-21T01:00:00.000Z',
      },
    ]
    expect(
      overviewStatus(es, {
        ...base,
        status: 'interviewing',
        outcomes: timed,
        interview: interviewOf(timed),
      }),
    ).toBe('Entrevista · mar 20 oct · en\u00a04\u00a0días')
    const past: OutcomeEvent[] = [
      { at: '2026-10-10T16:00:00.000Z', type: 'interview', scheduledAt: '2026-10-15' },
    ]
    expect(
      overviewStatus(es, {
        ...base,
        status: 'interviewing',
        outcomes: past,
        interview: interviewOf(past),
      }),
    ).toBe('En entrevistas')
  })

  it('a call is a call, not an interview', () => {
    const outcomes: OutcomeEvent[] = [
      applied,
      { at: '2026-10-14T16:00:00.000Z', type: 'screen', scheduledAt: '2026-10-19' },
    ]
    expect(
      overviewStatus(es, {
        ...base,
        status: 'applied',
        outcomes,
        interview: interviewOf(outcomes),
      }),
    ).toBe('Llamada · lun 19 oct · en\u00a03\u00a0días')
  })

  it('names how it ended, and never guesses an unknown close into a rejection', () => {
    const rejected: OutcomeEvent[] = [applied, { at: '2026-10-12T16:00:00.000Z', type: 'rejected' }]
    expect(overviewStatus(es, { ...base, status: 'closed', outcomes: rejected })).toBe(
      'Rechazada · 12 oct',
    )
    expect(overviewStatus(es, { ...base, status: 'closed', outcomes: [applied] })).toBe('Cerrada')
    const offer: OutcomeEvent[] = [applied, { at: '2026-10-13T16:00:00.000Z', type: 'offer' }]
    expect(overviewStatus(es, { ...base, status: 'offer', outcomes: offer })).toBe(
      'Oferta · 13 oct',
    )
    expect(overviewStatus(es, { ...base, status: 'archived' })).toBe('La descartaste')
  })

  it('before sending: when it was analysed, or that the CV is ready', () => {
    // SQLite's UTC timestamp, read as UTC: 18:00Z on the 5th is the 5th in Mexico City.
    expect(overviewStatus(es, base)).toBe('Analizada el 5 oct')
    expect(overviewStatus(es, { ...base, status: 'drafting', hasCv: true })).toBe(
      'CV listo · aún no lo envías',
    )
  })
})

describe('calendar days, not 24-hour periods', () => {
  // NOW is 09:00 on 16 Oct in Mexico City (15:00Z).
  it('sent at 22:00 last night is one day ago, not "today"', () => {
    const lastNight = { at: '2026-10-16T04:00:00.000Z', type: 'applied' as const } // 22:00 on the 15th, local
    expect(calendarDaysSince(lastNight.at, NOW, TZ)).toBe(1)
    expect(overviewStatus(es, { ...base, status: 'applied', outcomes: [lastNight] })).toBe(
      'Enviada el 15 oct · 1 día sin respuesta',
    )
  })

  it('"today" is the same local calendar day, either side of UTC midnight', () => {
    const earlyToday = { at: '2026-10-16T06:30:00.000Z', type: 'applied' as const } // 00:30 local
    expect(overviewStatus(es, { ...base, status: 'applied', outcomes: [earlyToday] })).toBe(
      'Enviada hoy',
    )
    // 23:50 local on the 16th is already the 17th in UTC — still today here.
    const lateNow = Date.parse('2026-10-17T05:50:00.000Z')
    const morning = { at: '2026-10-16T14:00:00.000Z', type: 'applied' as const }
    expect(
      overviewStatus(es, { ...base, now: lateNow, status: 'applied', outcomes: [morning] }),
    ).toBe('Enviada hoy')
    // Ten minutes later it is the 17th locally: one day.
    expect(calendarDaysSince(morning.at, Date.parse('2026-10-17T06:10:00.000Z'), TZ)).toBe(1)
  })

  it('counts the calendar difference, not the floor of elapsed hours', () => {
    // 7 Oct 17:00Z (11:00 local) to 16 Oct 09:00 local: 8.9 days elapsed, 9 calendar days.
    expect(calendarDaysSince('2026-10-07T17:00:00.000Z', NOW, TZ)).toBe(9)
  })
})

describe('nextMoveKey', () => {
  it('names the step the button opens', () => {
    expect(nextMoveKey('decide', { archived: false, draftWaiting: false })).toBe(
      'overview.next.decide',
    )
    expect(nextMoveKey('decide', { archived: true, draftWaiting: false })).toBe(
      'overview.next.archived',
    )
    expect(nextMoveKey('track', { archived: false, draftWaiting: true })).toBe(
      'overview.next.draft',
    )
    expect(nextMoveKey('send', { archived: false, draftWaiting: true })).toBe('overview.next.send')
  })
})

describe('cardStatus (the Postulaciones card)', () => {
  const card = (over: Partial<OverviewStatusInput>) => {
    const i = { ...base, ...over }
    return cardStatus(es, { ...i, interview: cardInterviewOf(i.outcomes, NOW, TZ) })
  }

  it('sent: how long ago, and that nobody answered', () => {
    expect(card({ status: 'applied', outcomes: [applied] })).toBe(
      'Enviada hace 9 días, sin respuesta',
    )
    const yesterday = { at: '2026-10-15T14:00:00.000Z', type: 'applied' as const }
    expect(card({ status: 'applied', outcomes: [yesterday] })).toBe(
      'Enviada hace 1 día, sin respuesta',
    )
    expect(
      cardStatus(en, {
        ...base,
        locale: 'en',
        status: 'applied',
        outcomes: [applied],
        interview: null,
      }),
    ).toBe('Sent 9 days ago, no reply')
  })

  it('a reply replaces "sin respuesta"', () => {
    const ack = { at: '2026-10-13T16:00:00.000Z', type: 'acknowledged' as const }
    expect(card({ status: 'applied', outcomes: [applied, ack] })).toBe('Respondieron hace 3 días')
  })

  it('an upcoming call: its kind, its day, and how far off', () => {
    const call = {
      at: '2026-10-14T16:00:00.000Z',
      type: 'interview' as const,
      scheduledAt: '2026-10-20',
    }
    expect(card({ status: 'interviewing', outcomes: [applied, call] })).toBe(
      'Entrevista · mar 20 oct · en\u00a04\u00a0días',
    )
    const en_ = { ...base, locale: 'en' as const, status: 'interviewing' as const }
    expect(
      cardStatus(en, {
        ...en_,
        outcomes: [applied, call],
        interview: cardInterviewOf([applied, call], NOW, TZ),
      }),
    ).toBe('Interview · Tue, Oct 20 · in\u00a04\u00a0days')
    const screenToday = {
      at: '2026-10-14T16:00:00.000Z',
      type: 'screen' as const,
      scheduledAt: '2026-10-16',
    }
    expect(card({ status: 'applied', outcomes: [applied, screenToday] })).toBe(
      'Llamada · vie 16 oct · hoy',
    )
    // No date logged: the stage alone, nothing invented.
    const undated = { at: '2026-10-14T16:00:00.000Z', type: 'interview' as const }
    expect(card({ status: 'interviewing', outcomes: [applied, undated] })).toBe('En entrevistas')
  })

  it('documents, then analysed N days ago', () => {
    expect(card({ status: 'drafting', hasCv: true })).toBe('Documentos listos')
    // No CV saved (a companion merged after a failed CV stage): not a kit,
    // and the overview says the same.
    expect(card({ status: 'drafting', hasCv: false })).toBe('Analizada hace 11 días')
    expect(overviewStatus(es, { ...base, status: 'drafting', hasCv: false })).toBe(
      'Analizada el 5 oct',
    )
    expect(card({ status: 'triaged' })).toBe('Analizada hace 11 días')
    expect(card({ status: 'triaged', createdAt: '2026-10-16 14:00:00' })).toBe('Analizada hoy')
  })

  it('an ended application names how it ended', () => {
    expect(card({ status: 'archived' })).toBe('La descartaste')
  })

  it('needs no interview card without a call in the log', () => {
    expect(cardInterviewOf([applied], NOW, TZ)).toBeNull()
  })
})

describe("attentionPrompt (the attention card's question)", () => {
  const ask = (
    state: string,
    reason: 'stale' | 'interviewing' | 'decide' | 'unsent',
    upcoming = false,
  ) => attentionPrompt(es, { state, reason, upcoming })

  it('joins the state line and the question the grid answers', () => {
    expect(ask('Enviada hace 9 días, sin respuesta', 'stale')).toBe(
      'Enviada hace 9 días, sin respuesta. ¿Qué pasó?',
    )
    expect(ask('En entrevistas', 'interviewing')).toBe('En entrevistas. ¿Qué pasó?')
    expect(ask('Documentos listos', 'unsent')).toBe('Documentos listos. ¿Ya la enviaste?')
    expect(ask('Analizada hace 3 días', 'decide')).toBe('Analizada hace 3 días. ¿Ya la enviaste?')
    expect(
      attentionPrompt(en, { state: 'Documents ready', reason: 'unsent', upcoming: false }),
    ).toBe('Documents ready. Did you send it?')
  })

  it('asks nothing about a call still ahead; once its day has passed the question returns', () => {
    expect(ask('Entrevista · mar 20 oct · en\u00a04\u00a0días', 'interviewing', true)).toBe(
      'Entrevista · mar 20 oct · en\u00a04\u00a0días',
    )
    const past = {
      at: '2026-10-10T16:00:00.000Z',
      type: 'interview' as const,
      scheduledAt: '2026-10-14',
    }
    const ahead = { ...past, scheduledAt: '2026-10-20' }
    expect(hasUpcomingCall(cardInterviewOf([applied, ahead], NOW, TZ))).toBe(true)
    expect(hasUpcomingCall(cardInterviewOf([applied, past], NOW, TZ))).toBe(false)
    const line = cardStatus(es, {
      ...base,
      status: 'interviewing',
      outcomes: [applied, past],
      interview: cardInterviewOf([applied, past], NOW, TZ),
    })
    expect(attentionPrompt(es, { state: line, reason: 'interviewing', upcoming: false })).toBe(
      'En entrevistas. ¿Qué pasó?',
    )
  })
})
