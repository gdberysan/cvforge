/**
 * What each screen reads, by name — the web edition's counterpart of a
 * server page's data fetching. Each entry calls the same lib/pages loader
 * the desktop page does, on the Worker's database.
 */

import { getProfile } from '@/lib/db/queries/profile'
import { spendSummary } from '@/lib/db/queries/spend'
import { effectiveMarkets } from '@/lib/markets'
import { loadApplication } from '@/lib/pages/application'
import { loadEvidence } from '@/lib/pages/evidence'
import { loadHome } from '@/lib/pages/home'
import { loadPipeline, type PipelineSearch } from '@/lib/pages/pipeline'
import { loadCvs, loadGaps, loadImport, loadInterview } from '@/lib/pages/small'
import { loadStats } from '@/lib/pages/stats'
import { readSettings } from '@/lib/settings'
import { onTrial } from '@/web/lib/settings'
import { db } from './db'
import { getLocale } from './shims/i18n-server'

export const LOADERS = {
  /** The nav: whether there is anything to navigate to, and the spend so far. */
  shell: () => ({
    started: getProfile(db()) !== null,
    spendUsd: spendSummary(db()).totalUsd,
    /** On the free trial: the nav says so instead of a spend the person is not paying. */
    trial: onTrial(),
  }),
  /** The person's markets, for any screen with a triage console. */
  markets: () => {
    const p = getProfile(db())
    return p ? effectiveMarkets(p.preferences.markets, p.basics.location) : []
  },
  settings: () => ({
    hasKey: Boolean(readSettings().anthropicApiKey),
    trial: onTrial(),
    trialEnded: Boolean(readSettings().trialEnded),
    unknownCost: spendSummary(db()).unknownCost,
  }),
  home: () => loadHome(db(), { now: new Date().toISOString(), demo: false, agent: null }),
  evidence: () => loadEvidence(db()),
  cvs: () => loadCvs(db()),
  stats: () => loadStats(db()),
  pipeline: async (args: { search: PipelineSearch }) =>
    loadPipeline(db(), { search: args.search, locale: await getLocale(), demo: false }),
  import: () => loadImport(db()),
  interview: (args: { roleId: string }) => loadInterview(db(), args.roleId),
  gaps: (args: { id: string }) => loadGaps(db(), args.id),
  application: async (args: { id: string; search: { gapdelta?: string; step?: string } }) =>
    loadApplication(db(), { ...args, locale: await getLocale(), demo: false, mail: null }),
}

export type Loaders = typeof LOADERS
export type LoaderName = keyof Loaders

export type LoaderArgs<N extends LoaderName> = Parameters<Loaders[N]>[0]

export function load<N extends LoaderName>(name: N, args?: LoaderArgs<N>): ReturnType<Loaders[N]> {
  const fn = LOADERS[name] as ((a?: unknown) => ReturnType<Loaders[N]>) | undefined
  if (!fn) throw Object.assign(new Error(`No screen data ${name}.`), { code: 'not-in-browser' })
  return fn(args)
}
