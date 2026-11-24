import { selectEvidenceForComposition } from '@/lib/ai/stages/compose-cv'
import type {
  CVContent,
  EvidenceItem,
  EvidenceMapping,
  GroundingReport,
  Market,
  MasterProfile,
  Requirement,
} from '@/lib/schemas'
import { codeChecksPassed, runDeterministicChecks, verifiableLines } from '@/lib/verify/checks'
import { checkArgsOf } from './compose'
import { postingVocabularyOf } from './distortions'

/**
 * Editing a written CV by hand. The person changes words, never facts:
 * the browser sends only a patch of text (the summary, each bullet's text or
 * its removal, the skills lists), applied here to the saved CV, so an edit
 * cannot touch an employer, a date, a title or a citation.
 *
 * The edited CV gets the code checks right away, as writing does (figures,
 * citations, claimed gaps, unsupported claims), and a line the person changed
 * gets no model verdict: the model's earlier judgement is kept only for lines
 * whose text is unchanged, and the changed ones are named, so the screen says
 * "your wording, checked in code" instead of implying more.
 */
export type CvPatch = {
  summary?: string
  /** Bullet id to its new text; null removes the bullet. */
  bullets?: Record<string, string | null>
  /** The skills lists, category by category, in order. */
  skills?: { category: string; items: string[] }[]
}

const MAX_LINE = 600

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE)

export function applyCvPatch(saved: CVContent, patch: CvPatch): CVContent {
  const bullets = patch.bullets ?? {}
  const edit = <B extends { id: string; text: string }>(list: B[]): B[] =>
    list.flatMap((b) => {
      if (!(b.id in bullets)) return [b]
      const next = bullets[b.id]
      if (next === null || next === undefined) return []
      const text = clean(next)
      return text ? [{ ...b, text }] : []
    })
  return {
    ...saved,
    summary: patch.summary === undefined ? saved.summary : clean(patch.summary),
    experience: saved.experience.map((r) => ({ ...r, bullets: edit(r.bullets) })),
    projects: saved.projects.map((p) => ({ ...p, bullets: edit(p.bullets) })),
    skills:
      patch.skills === undefined
        ? saved.skills
        : patch.skills
            .map((s) => ({
              category: clean(s.category),
              items: s.items.map(clean).filter(Boolean),
            }))
            .filter((s) => s.category && s.items.length > 0),
  }
}

/** The ids of the lines whose text an edit changed (or removed). */
export function editedLineIds(
  before: CVContent,
  after: CVContent,
  profile: MasterProfile,
): Set<string> {
  const text = (cv: CVContent) =>
    new Map(verifiableLines(cv, profile, []).map((l) => [l.id, l.text]))
  const a = text(before)
  const b = text(after)
  const edited = new Set<string>()
  for (const [id, t] of a) if (b.get(id) !== t) edited.add(id)
  for (const id of b.keys()) if (!a.has(id)) edited.add(id)
  return edited
}

export function checkEditedCv(args: {
  saved: CVContent
  savedReport: GroundingReport | null
  edited: CVContent
  profile: MasterProfile
  evidence: EvidenceItem[]
  requirements: Requirement[]
  mappings: EvidenceMapping[]
  jobTitle: string
  market?: Market
}): { report: GroundingReport; edited: string[] } {
  const selectedIds = new Set(
    selectEvidenceForComposition(args.mappings, args.evidence).map((e) => e.id),
  )
  const report = runDeterministicChecks({
    cv: args.edited,
    ...checkArgsOf(
      {
        evidence: args.evidence,
        profile: args.profile,
        requirements: args.requirements,
        mappings: args.mappings,
        jobTitle: args.jobTitle,
        focus: undefined,
        postingVocabulary: postingVocabularyOf(args.requirements),
        market: args.market,
      },
      selectedIds,
    ),
  })
  const edited = editedLineIds(args.saved, args.edited, args.profile)
  const still = new Set(verifiableLines(args.edited, args.profile, selectedIds).map((l) => l.id))
  report.distortions = (args.savedReport?.distortions ?? []).filter(
    (d) => !edited.has(d.bulletId) && still.has(d.bulletId),
  )
  report.passed = codeChecksPassed(report) && report.distortions.length === 0
  return { report, edited: [...edited] }
}
