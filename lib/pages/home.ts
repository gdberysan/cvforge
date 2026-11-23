/**
 * Everything the home screen reads, as plain data: the desktop page calls
 * this with its database, the web edition's Worker with its own. The screen
 * itself (components/pages/HomeView.tsx) only renders what comes back, so
 * one screen serves both editions.
 */

import type { FindCard } from '@/components/today/AgentFinds'
import type { MailCard } from '@/components/today/MailSuggestions'
import { companyName } from '@/lib/company-name'
import type { Db } from '@/lib/db/client'
import { listFullApplications } from '@/lib/db/queries/applications'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { demoPostings } from '@/lib/demo/postings'
import type { Market } from '@/lib/markets'
import { hasCredentials } from '@/lib/settings'
import {
  type AttentionItem,
  attentionApplications,
  type ResponseRate,
  responseRateSeries,
  toStatApp,
  waitingApplications,
} from '@/lib/stats'
import { computeProfileStrength, type Suggestion } from '@/lib/strength'

export type HomeData =
  | { kind: 'first-run'; needsKey: boolean }
  | {
      kind: 'home'
      /** The greeting's name: the first word of the CV's name, or nothing. */
      firstName: string
      markets: Market[]
      demo: { postings: { id: string; label: string; text: string }[] } | null
      finds: FindCard[]
      mail: { cards: MailCard[]; waiting: { id: string; label: string }[] }
      appCount: number
      /** What needs the person, joined with the application it is about. */
      needs: { item: AttentionItem; title: string; company: string }[]
      waitingCount: number
      rate: ResponseRate
      strength: { score: number; topFix: Suggestion | null }
    }

/**
 * The job agent's cards exist only in the personal desktop build: it passes
 * them in, so this module (and the browser edition) never loads the agent.
 */
export type AgentCards = {
  finds: () => FindCard[]
  mail: (waiting: { id: string; label: string }[]) => MailCard[]
}

export function loadHome(
  db: Db,
  opts: { now: string; demo: boolean; agent: AgentCards | null },
): HomeData {
  const profile = getProfile(db)
  if (!profile) return { kind: 'first-run', needsKey: !hasCredentials() }

  const evidence = listEvidence(db)
  const fullApps = listFullApplications(db)
  const waitingApps = fullApps
    .filter((a) => a.status === 'applied' || a.status === 'interviewing')
    .map((a) => ({ id: a.id, label: appLabel(a) }))
  const statApps = fullApps.map(toStatApp)
  const allNeeds = attentionApplications(statApps, opts.now)
  const needsIds = new Set(allNeeds.map((i) => i.id))
  // Waiting, but not yet long enough to need a nudge: nothing to do.
  const waitingCount = waitingApplications(statApps).filter((a) => !needsIds.has(a.id)).length
  const strength = computeProfileStrength(profile, evidence)
  const agent = opts.demo ? null : opts.agent

  return {
    kind: 'home',
    firstName: profile.basics.fullName.trim().split(/\s+/)[0] ?? '',
    markets: profile.preferences.markets,
    demo: opts.demo ? { postings: demoPostings(db) } : null,
    finds: agent?.finds() ?? [],
    mail: { cards: agent?.mail(waitingApps) ?? [], waiting: waitingApps },
    appCount: fullApps.length,
    needs: allNeeds.flatMap((item) => {
      const app = fullApps.find((a) => a.id === item.id)
      return app ? [{ item, title: app.jobTitle, company: companyName(app.company) }] : []
    }),
    waitingCount,
    rate: responseRateSeries(statApps, opts.now),
    strength: { score: strength.score, topFix: strength.suggestions[0] ?? null },
  }
}

function appLabel(a: { jobTitle: string; company: string }): string {
  const company = companyName(a.company)
  return company ? `${a.jobTitle} · ${company}` : a.jobTitle
}
