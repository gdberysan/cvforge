import type { MessageKey } from '@/lib/i18n'
import {
  type Coverage,
  type EvidenceMapping,
  GATING_KINDS,
  type Requirement,
  type Verdict,
} from '@/lib/schemas'

/**
 * Pure arithmetic over the mappings. No model produces any number here — that
 * is the whole point. An LLM-generated 0–100 clusters between 65 and 85 and
 * stops being trusted by week two; a count of requirements is reproducible,
 * explainable, and arguable.
 *
 * The thresholds below are deliberate starting guesses. Phase 6's
 * response-rate-by-coverage data is what should eventually replace them.
 */
export function computeCoverage(
  requirements: Requirement[],
  mappings: EvidenceMapping[],
): Coverage {
  const strengthOf = new Map(mappings.map((m) => [m.requirementId, m.strength]))
  const get = (id: string) => strengthOf.get(id) ?? 'none'

  const mandatory = requirements.filter((r) => r.mandatory)
  const desirable = requirements.filter((r) => !r.mandatory)

  const count = (list: Requirement[], strength: 'strong' | 'partial' | 'none') =>
    list.filter((r) => get(r.id) === strength).length

  const mandatoryStrong = count(mandatory, 'strong')
  const mandatoryPartial = count(mandatory, 'partial')
  const mandatoryMissing = count(mandatory, 'none')

  const desirableStrong = count(desirable, 'strong')
  const desirablePartial = count(desirable, 'partial')
  const desirableMissing = count(desirable, 'none')

  // A gating requirement (location/timezone/authorization) is normally only
  // terminal when it's flagged mandatory — a genuinely optional "nice to
  // have: based in CDMX" must not gate a normal posting. But when nothing
  // at all got flagged mandatory, that flag is not trustworthy (the same
  // extraction failure the mandatoryTotal === 0 branch below exists to
  // handle), so an unmet gating requirement sitting in the desirable pool
  // is scoped in as a blocker too — the misclassification cuts both ways,
  // not just toward softer counts.
  const hardBlockers = requirements.filter(
    (r) =>
      GATING_KINDS.has(r.kind) && get(r.id) === 'none' && (r.mandatory || mandatory.length === 0),
  )

  return {
    mandatoryTotal: mandatory.length,
    mandatoryStrong,
    mandatoryPartial,
    mandatoryMissing,
    desirableTotal: desirable.length,
    desirableStrong,
    desirablePartial,
    desirableMissing,
    hardBlockers,
    verdict: decideVerdict({
      hardBlockerCount: hardBlockers.length,
      mandatoryTotal: mandatory.length,
      mandatoryStrong,
      mandatoryPartial,
      mandatoryMissing,
      desirableTotal: desirable.length,
      desirableStrong,
      desirablePartial,
      desirableMissing,
    }),
  }
}

function decideVerdict(input: {
  hardBlockerCount: number
  mandatoryTotal: number
  mandatoryStrong: number
  mandatoryPartial: number
  mandatoryMissing: number
  desirableTotal: number
  desirableStrong: number
  desirablePartial: number
  desirableMissing: number
}): Verdict {
  // A location, timezone, or authorization gap is terminal. No amount of
  // tailoring closes it, so nothing else about the posting matters.
  if (input.hardBlockerCount > 0) return 'skip'

  // Genuinely nothing extracted — no mandatory AND no desirable requirements
  // at all — is a MORE complete extraction failure than 0-of-24, not a
  // milder one, and the same "nothing is stated, so nothing can disqualify
  // you" reasoning that motivated this whole rewrite's premise is exactly as
  // false here. Nothing was extracted, so nothing is known about fit —
  // "unknown" is not "promising", and this must not stand as the one
  // remaining path to a good verdict on zero evidence.
  if (input.mandatoryTotal === 0 && input.desirableTotal === 0) return 'stretch'

  // A real posting marks 58%-94% of its requirements mandatory. 0 mandatory
  // with requirements still on the board (the HP "Marketing Automation
  // Engineer" case: 0/24) is an extraction failure, not a permissive
  // employer, and must not be waved through as automatically 'worth-it'.
  // Judge on the desirable pool instead — but the pre-fix function
  // guaranteed 'worth-it' (never better) for every mandatoryTotal === 0
  // input regardless of desirable coverage, and this rewrite must never be
  // MORE generous than that for any input it used to handle. So this branch
  // caps its best possible outcome at 'worth-it' — it can only get stricter
  // (stretch), never reach 'strong'.
  if (input.mandatoryTotal === 0) {
    const combinedRatio = (input.desirableStrong + input.desirablePartial) / input.desirableTotal
    if (combinedRatio >= 0.7 && input.desirableMissing <= 2) return 'worth-it'
    return 'stretch'
  }

  const strongRatio = input.mandatoryStrong / input.mandatoryTotal
  const combinedRatio = (input.mandatoryStrong + input.mandatoryPartial) / input.mandatoryTotal

  if (strongRatio >= 0.8) return 'strong'
  if (combinedRatio >= 0.7 && input.mandatoryMissing <= 2) return 'worth-it'

  // Everything short of that is a stretch, however short. `skip` is reserved
  // for the gate above, because it used to carry a second meaning — "long
  // shot" — on a count the model does not reproduce: two eval runs over the
  // same postings and the same evidence, ten minutes apart, disagreed about
  // `mandatoryMissing` by enough to cross this boundary in 2 of 6 fixtures
  // (4 vs 7, 4 vs 5). Telling someone not to apply is too consequential to
  // decide on a coin flip, and since gap-fill shipped a shortfall is
  // something they can act on rather than a closed door. The counts stay on
  // screen, so "how far" is still visible — it just no longer masquerades as
  // a disqualification.
  return 'stretch'
}

/**
 * Amber means a verdict worth acting on, deliberately departing from Korven's
 * --signal-warn alias (spec §10.3): amber is the raven's eye, the positive
 * focal signal, so a posting worth your time should glow.
 */
export const VERDICT_COLOR: Record<Verdict, string> = {
  strong: 'var(--accent)',
  'worth-it': 'var(--accent)',
  stretch: 'var(--text-muted)',
  skip: 'var(--signal-error)',
}

/**
 * The verdict's wording lives in the dictionary like every other string; this
 * maps a verdict to the two keys that describe it.
 */
export const VERDICT_KEYS: Record<Verdict, { label: MessageKey; detail: MessageKey }> = {
  strong: { label: 'verdict.strong.label', detail: 'verdict.strong.detail' },
  'worth-it': { label: 'verdict.worth-it.label', detail: 'verdict.worth-it.detail' },
  stretch: { label: 'verdict.stretch.label', detail: 'verdict.stretch.detail' },
  skip: { label: 'verdict.skip.label', detail: 'verdict.skip.detail' },
}
