import { describe, expect, it } from 'vitest'
import { callLine, callWhen, isCallAhead, trackAskKey } from '@/lib/call-line'
import { makeTranslate } from '@/lib/i18n'
import { buildThread } from '@/lib/mail-thread'
import { cardStatus, overviewStatus } from '@/lib/overview-status'
import type { OutcomeEvent } from '@/lib/schemas'
import { seguimientoView } from '@/lib/seguimiento-view'

const NOW = Date.parse('2026-10-17T15:00:00.000Z')
const TZ = 'America/Mexico_City'
const es = makeTranslate('es')
const en = makeTranslate('en')

const applied: OutcomeEvent = { at: '2026-10-07T14:00:00.000Z', type: 'applied' }
const call = (scheduledAt: string, type: 'interview' | 'screen' = 'interview'): OutcomeEvent => ({
  at: '2026-10-14T16:00:00.000Z',
  type,
  scheduledAt,
})

function thread(outcomes: OutcomeEvent[]) {
  return buildThread({
    outcomes: outcomes.map((o, i) => ({
      id: `o${i}`,
      at: o.at,
      type: o.type,
      note: null,
      scheduledAt: o.scheduledAt ?? null,
    })),
    mail: [],
    drafts: [],
    account: null,
    now: NOW,
    timeZone: TZ,
  })
}

describe('callWhen', () => {
  it('hoy, mañana, en N días — and for a past call, ayer, hace N días', () => {
    expect([0, 1, 3, -1, -4].map((d) => callWhen(es, d))).toEqual([
      'hoy',
      'mañana',
      'en\u00a03\u00a0días',
      'ayer',
      'hace\u00a04\u00a0días',
    ])
    expect([0, 1, 3].map((d) => callWhen(en, d))).toEqual([
      'today',
      'tomorrow',
      'in\u00a03\u00a0days',
    ])
  })
})

describe('one wording for an upcoming call', () => {
  it('the overview, the Postulaciones card and Seguimiento say the same line', () => {
    for (const [outcomes, line] of [
      [[applied, call('2026-10-20')], 'Entrevista · mar 20 oct · en\u00a03\u00a0días'],
      [[applied, call('2026-10-18')], 'Entrevista · dom 18 oct · mañana'],
      [[applied, call('2026-10-17', 'screen')], 'Llamada · sáb 17 oct · hoy'],
    ] as const) {
      const view = thread([...outcomes])
      const input = {
        status: 'interviewing' as const,
        outcomes: [...outcomes],
        interview: view.interview,
        hasCv: true,
        createdAt: '2026-10-05 18:00:00',
        locale: 'es' as const,
        timeZone: TZ,
        now: NOW,
      }
      expect(overviewStatus(es, input)).toBe(line)
      expect(cardStatus(es, input)).toBe(line)
      const seg = seguimientoView({ view, company: 'Acme', locale: 'es', timeZone: TZ, now: NOW })
      if (seg.interview?.state !== 'scheduled') throw new Error('expected a scheduled call')
      expect(callLine(es, seg.interview)).toBe(line)
    }
  })
})

describe("Seguimiento's question (trackAskKey), the card's rule", () => {
  it('a call today or ahead: a neutral heading, no "¿Qué pasó?"; once past, the question returns', () => {
    const ahead = thread([applied, call('2026-10-20')]).interview
    const today = thread([applied, call('2026-10-17')]).interview
    const past = thread([applied, call('2026-10-15')]).interview
    expect(isCallAhead(ahead)).toBe(true)
    expect(es(trackAskKey(4, ahead))).toBe('Anotar qué pasó')
    expect(en(trackAskKey(4, today))).toBe('Log what happened')
    expect(isCallAhead(past)).toBe(false)
    expect(es(trackAskKey(4, past))).toBe('¿Qué pasó?')
    expect(es(trackAskKey(4, null))).toBe('¿Qué pasó?')
    // Before sending, the one move is "I sent it".
    expect(es(trackAskKey(1, null))).toBe('¿Ya la enviaste?')
  })
})
