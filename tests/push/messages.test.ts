import { describe, expect, it } from 'vitest'
import {
  documentMessage,
  findMessage,
  followUpMessage,
  kitMessage,
  mailOutcomeMessage,
  verdictMessage,
  weeklyMessage,
} from '@/lib/push/messages'

describe('push messages', () => {
  it('a verdict carries the verdict word, the job and a link — nothing else', () => {
    expect(
      verdictMessage('es', {
        verdict: 'worth-it',
        jobTitle: 'Growth Lead',
        company: 'Acme',
        applicationId: 'a1',
      }),
    ).toEqual({
      kind: 'verdict-ready',
      title: 'Vale la pena',
      body: 'Growth Lead · Acme',
      url: '/application/a1',
    })
  })

  it('a finished document links to its step, without a dangling separator', () => {
    expect(
      documentMessage('en', {
        kind: 'cv',
        jobTitle: 'Growth Lead',
        company: '',
        applicationId: 'a1',
      }),
    ).toEqual({
      kind: 'document-ready',
      title: 'CV ready',
      body: 'Growth Lead',
      url: '/application/a1?step=docs',
    })
  })

  it('a ready kit and a failed one both open the documents step', () => {
    const a = { jobTitle: 'Growth Lead', company: 'Acme', applicationId: 'a1' }
    expect(kitMessage('es', { ok: true, ...a })).toEqual({
      kind: 'kit-ready',
      title: 'Kit listo: Growth Lead',
      body: 'Acme',
      url: '/application/a1?step=docs',
    })
    expect(kitMessage('en', { ok: false, ...a })).toEqual({
      kind: 'kit-failed',
      title: "Couldn't prepare the kit: Growth Lead",
      body: 'Acme',
      url: '/application/a1?step=docs',
    })
  })

  it('a find says what and how good, and opens its card on Hoy', () => {
    expect(
      findMessage('es', {
        postingId: '4460829599',
        jobTitle: 'Growth Lead',
        company: 'Acme',
        verdict: 'strong',
      }),
    ).toEqual({
      kind: 'agent-find',
      title: 'Nueva vacante: Growth Lead',
      body: 'Acme · Coincidencia fuerte',
      url: '/?find=4460829599',
    })
  })
})

describe('follow-up and weekly messages', () => {
  it('a follow-up asks about the company and opens the outcome step', () => {
    expect(
      followUpMessage('es', { jobTitle: 'Growth Lead', company: 'Acme', applicationId: 'a1' }),
    ).toEqual({
      kind: 'follow-up',
      title: '¿Hubo respuesta de Acme?',
      body: 'Growth Lead',
      url: '/application/a1?step=track',
    })
  })

  it('a follow-up with no company asks about the job instead', () => {
    expect(
      followUpMessage('en', { jobTitle: 'Growth Lead', company: '  ', applicationId: 'a1' }).title,
    ).toBe('Any reply about Growth Lead?')
  })

  it('the weekly report counts the week and opens Números', () => {
    expect(weeklyMessage('es', { triaged: 12, chased: 3, applied: 2, interviews: 1 })).toEqual({
      kind: 'weekly-report',
      title: 'Tu semana',
      body: 'Analizadas: 12 · Elegidas: 3 · Enviadas: 2 · Entrevistas: 1',
      url: '/stats',
    })
    expect(weeklyMessage('en', { triaged: 0, chased: 0, applied: 0, interviews: 0 }).body).toBe(
      'Analysed: 0 · Pursued: 0 · Sent: 0 · Interviews: 0',
    )
  })

  it('a reply from an employer names the company and the outcome, and opens the track step', () => {
    const a = {
      company: 'Acme',
      jobTitle: 'Growth Lead',
      applicationId: 'a1',
      kind: 'interview' as const,
      quote: 'We would like to meet you.',
    }
    expect(mailOutcomeMessage('en', a)).toEqual({
      kind: 'mail-outcome',
      title: 'Acme: interview',
      body: 'We would like to meet you.',
      url: '/application/a1?step=track',
    })
    expect(mailOutcomeMessage('es', { ...a, kind: 'rejected', company: ' ' }).title).toBe(
      'Growth Lead: rechazada',
    )
  })
})
