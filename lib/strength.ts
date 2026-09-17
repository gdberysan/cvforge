import type { Params } from '@/lib/i18n'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'

/**
 * Each rule owns a slice of the score, and losing points always produces a
 * suggestion naming the specific fix. A gauge that cannot tell you what to
 * change is decoration.
 */
const RULES = {
  summary: 15,
  experience: 15,
  evidencePerRole: 20,
  metrics: 25,
  tags: 10,
  skills: 10,
  targetTitles: 5,
} as const

export type CategoryId = keyof typeof RULES

/** One row of the score breakdown — the same seven slices RULES defines,
 *  always in that order, so the UI can render a fixed checklist rather than
 *  reconstructing one from whatever suggestions happened to fire. */
export type CategoryResult = { id: CategoryId; points: number; earned: boolean }

/**
 * A suggestion carries the reason it fired, not a sentence. Scoring is the same
 * arithmetic in every language, so the wording belongs to the view — and a
 * stable id is also what lets the UI key, group and test these.
 */
export type Suggestion = {
  id: SuggestionId
  severity: 'high' | 'medium' | 'low'
  /** Filled into the message: {company}, {n}. */
  params?: Params
  /** Set when the fix has an address — the role this is about. */
  targetId?: string
  /** True when the message has one/other forms chosen by params.n. */
  countable?: boolean
}

export type SuggestionId =
  | 'summary-empty'
  | 'no-experience'
  | 'role-without-evidence'
  | 'metrics-missing'
  | 'tags-missing'
  | 'skills-empty'
  | 'target-titles-empty'

export type ProfileStrength = {
  score: number
  suggestions: Suggestion[]
  categories: CategoryResult[]
}

export type RoleHealth = {
  recordCount: number
  quantified: number
  /** Empty or import-stubs only: the role cannot yet carry a CV. */
  needsExpanding: boolean
}

/**
 * One reading of "can this role carry a CV yet", shared by the evidence
 * rail's dots, the editor's amber prompt beside them, and the home-page
 * nudge — three hand-rolled copies of this predicate once disagreed by
 * construction the moment one changed.
 */
export function roleHealth(evidence: EvidenceItem[], roleId: string): RoleHealth {
  const own = evidence.filter((e) => e.sourceRef.type === 'experience' && e.sourceRef.id === roleId)
  return {
    recordCount: own.length,
    quantified: own.filter((e) => e.metrics.length > 0).length,
    needsExpanding: own.length === 0 || own.every((e) => e.origin === 'import'),
  }
}

export function computeProfileStrength(
  profile: MasterProfile,
  evidence: EvidenceItem[],
): ProfileStrength {
  const suggestions: Suggestion[] = []
  // Tracked alongside `score` so `categories` can be built once, in RULES'
  // own key order, rather than re-deriving "was this slice earned" from
  // whichever suggestions happened to fire (role-without-evidence pushes
  // zero-or-many, unlike every other rule).
  const earned = {} as Record<CategoryId, boolean>
  let score = 0

  if (profile.summary.trim().length >= 40) {
    earned.summary = true
    score += RULES.summary
  } else {
    suggestions.push({ id: 'summary-empty', severity: 'high' })
  }

  if (profile.experience.length > 0) {
    earned.experience = true
    score += RULES.experience
  } else {
    suggestions.push({ id: 'no-experience', severity: 'high' })
  }

  // Each conditional slice is awarded only when its antecedent set is
  // non-empty. "Every role has evidence" is vacuously true of zero roles,
  // and a gauge that starts over half full with no data is a vanity meter.
  const rolesWithoutEvidence = profile.experience.filter(
    (role) =>
      !evidence.some((e) => e.sourceRef.type === 'experience' && e.sourceRef.id === role.id),
  )
  if (profile.experience.length > 0 && rolesWithoutEvidence.length === 0) {
    earned.evidencePerRole = true
    score += RULES.evidencePerRole
  } else {
    for (const role of rolesWithoutEvidence) {
      suggestions.push({
        id: 'role-without-evidence',
        severity: 'high',
        targetId: role.id,
        params: { company: role.company },
      })
    }
  }

  const achievements = evidence.filter((e) => e.kind === 'achievement')
  const unquantified = achievements.filter((e) => e.metrics.length === 0)
  if (achievements.length > 0 && unquantified.length === 0) {
    earned.metrics = true
    score += RULES.metrics
  } else if (achievements.length > 0) {
    suggestions.push({
      id: 'metrics-missing',
      severity: 'medium',
      countable: true,
      params: { n: unquantified.length },
    })
  }

  const untagged = evidence.filter((e) => e.tags.length === 0)
  if (evidence.length > 0 && untagged.length === 0) {
    earned.tags = true
    score += RULES.tags
  } else if (evidence.length > 0) {
    suggestions.push({
      id: 'tags-missing',
      severity: 'medium',
      countable: true,
      params: { n: untagged.length },
    })
  }

  if (profile.skills.length > 0) {
    earned.skills = true
    score += RULES.skills
  } else {
    suggestions.push({ id: 'skills-empty', severity: 'medium' })
  }

  if (profile.preferences.targetTitles.length > 0) {
    earned.targetTitles = true
    score += RULES.targetTitles
  } else {
    suggestions.push({ id: 'target-titles-empty', severity: 'low' })
  }

  const categories = (Object.keys(RULES) as CategoryId[]).map((id) => ({
    id,
    points: RULES[id],
    earned: earned[id] === true,
  }))

  return { score: Math.max(0, Math.min(100, score)), suggestions, categories }
}
