import { VERDICT_KEYS } from '@/lib/coverage'
import { makeTranslate } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/locale'
import type { Verdict } from '@/lib/schemas'
import type { PushMessage } from './notify'

/** "Growth Lead · Acme", or just the title when there is no company — never a dangling dot. */
const job = (title: string, company: string) => [title, company].filter(Boolean).join(' · ')

export function verdictMessage(
  locale: Locale,
  a: { verdict: Verdict; jobTitle: string; company: string; applicationId: string },
): PushMessage {
  const t = makeTranslate(locale)
  return {
    kind: 'verdict-ready',
    title: t(VERDICT_KEYS[a.verdict].label),
    body: job(a.jobTitle, a.company),
    url: `/application/${a.applicationId}`,
  }
}

export function documentMessage(
  locale: Locale,
  a: { kind: 'cv' | 'companion'; jobTitle: string; company: string; applicationId: string },
): PushMessage {
  const t = makeTranslate(locale)
  return {
    kind: 'document-ready',
    title: t(a.kind === 'cv' ? 'push.cvReady' : 'push.companionReady'),
    body: job(a.jobTitle, a.company),
    url: `/application/${a.applicationId}?step=docs`,
  }
}

/** The background kit (lib/kit/runner.ts): one push for the whole kit, ready or not. */
export function kitMessage(
  locale: Locale,
  a: { ok: boolean; jobTitle: string; company: string; applicationId: string },
): PushMessage {
  const t = makeTranslate(locale)
  return {
    kind: a.ok ? 'kit-ready' : 'kit-failed',
    title: t(a.ok ? 'push.kitReady' : 'push.kitFailed', { title: a.jobTitle }),
    body: a.company,
    url: `/application/${a.applicationId}?step=docs`,
  }
}

/** A find from the job agent, opening its card on Hoy. */
export function findMessage(
  locale: Locale,
  a: { postingId: string; jobTitle: string; company: string; verdict: Verdict },
): PushMessage {
  const t = makeTranslate(locale)
  return {
    kind: 'agent-find',
    title: t('push.agentFind', { title: a.jobTitle }),
    body: [a.company, t(VERDICT_KEYS[a.verdict].label)].filter(Boolean).join(' · '),
    url: `/?find=${encodeURIComponent(a.postingId)}`,
  }
}

/** A quiet application (the agent's follow-ups): asks, and opens where the outcome is marked. */
export function followUpMessage(
  locale: Locale,
  a: { jobTitle: string; company: string; applicationId: string },
): PushMessage {
  const t = makeTranslate(locale)
  const company = a.company.trim()
  return {
    kind: 'follow-up',
    title: company ? t('push.followUp', { company }) : t('push.followUpJob', { title: a.jobTitle }),
    body: company ? a.jobTitle : '',
    url: `/application/${a.applicationId}?step=track`,
  }
}

/** Monday's summary of the agent's week, opening Números. */
export function weeklyMessage(
  locale: Locale,
  a: { triaged: number; chased: number; applied: number; interviews: number },
): PushMessage {
  const t = makeTranslate(locale)
  return {
    kind: 'weekly-report',
    title: t('push.weekly'),
    body: t('push.weeklyBody', a),
    url: '/stats',
  }
}

/** An employer's reply that matters, read from the inbox: opens where the outcome is marked. */
export function mailOutcomeMessage(
  locale: Locale,
  a: {
    company: string
    jobTitle: string
    applicationId: string
    kind: 'screen' | 'interview' | 'rejected' | 'offer'
    quote: string
  },
): PushMessage {
  const t = makeTranslate(locale)
  return {
    kind: 'mail-outcome',
    title: t('push.mailOutcome', {
      company: a.company.trim() || a.jobTitle,
      outcome: t(`outcome.${a.kind}` as const),
    }),
    body: a.quote,
    url: `/application/${a.applicationId}?step=track`,
  }
}
