/**
 * How a requirement reads against the evidence — one rule for every screen
 * that sorts requirements into "Te falta / Parcial / Cubres": the decide
 * step's chips (RequirementChips) and an agent find's preview on Hoy. Plain
 * module, no 'use client', so a server page can group before it renders.
 */

import type { Translate } from '@/lib/i18n'

export type Tone = 'strong' | 'partial' | 'missing' | 'unjudged' | 'neutral'

/** The fields the rule reads. */
export type ToneRow = {
  keyword: string
  strength: 'strong' | 'partial' | 'none'
  unjudged: boolean
  /** A location, timezone or authorization requirement that gates the verdict. */
  blocker?: boolean
}

export const toneOf = (r: ToneRow): Tone =>
  r.unjudged
    ? 'unjudged'
    : r.strength === 'strong'
      ? 'strong'
      : r.strength === 'partial'
        ? 'partial'
        : 'missing'

/** The order the groups read in: what you lack first, what you cover last. */
export const TONE_ORDER = ['missing', 'partial', 'strong', 'unjudged'] as const
export type GroupTone = (typeof TONE_ORDER)[number]

/**
 * Requirements split by tone, in TONE_ORDER, empty groups dropped. Within a
 * group a blocker leads (it gates the verdict), then the shortest chips first
 * so a line fills with whole words before one is cut; ties keep the given
 * order.
 */
export function groupByTone<R extends ToneRow>(rows: R[]): { tone: GroupTone; rows: R[] }[] {
  return TONE_ORDER.map((tone) => ({
    tone,
    rows: rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => toneOf(r) === tone)
      .sort(
        (a, b) =>
          Number(!!b.r.blocker) - Number(!!a.r.blocker) ||
          a.r.keyword.length - b.r.keyword.length ||
          a.i - b.i,
      )
      .map(({ r }) => r),
  })).filter((g) => g.rows.length > 0)
}

/** The tone in words, for the accessible name: colour is never the only carrier. */
export const toneWord = (t: Translate, r: ToneRow): string =>
  r.blocker
    ? t('requirements.blocked')
    : r.unjudged
      ? t('requirements.unjudged')
      : // The same words as the lists: «Sin respaldo», not a bare «ninguna».
        t(`gaps.tag.${r.strength}`)
