import { z } from 'zod'
import { callStructured } from '../client'

export const VerdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      bulletId: z.string(),
      supported: z.boolean(),
      reason: z.string(),
    }),
  ),
})

const SYSTEM = `You check whether a CV bullet overstates its source material.

For each bullet you are given its text and the full text of the evidence it cites, including each record's recorded metrics and the line of what it belongs to — for a role record, the role's title and employer; for a project record, the project's own line (name, stack, dates) — all of these are the person's recorded facts. Answer one question: does the bullet assert anything its sources do not support?

Mark supported=false when the bullet:
- inflates scope or ownership ("led" where the source says "contributed to"; "single-handedly" where the source says "with the team")
- states an outcome the source only describes as an attempt or intention
- generalises one instance into a pattern ("routinely", "consistently") without support
- adds a technology, client, or responsibility absent from the sources
- presents the person as holding a job title no source shows — naming the role being applied for is fine; claiming to be it ("As Marketing ROI Lead, I bring…") is not
- speaks in the present tense about work whose source periods have all ended — each source line starts with its [start–end] period, and an ended engagement must not sound current

Mark supported=true when the bullet is a faithful rephrasing, compression, or reordering — even if the wording differs a lot from the source. Rephrasing is the point; only added claims are the problem.

A source marked [known gap] is a requirement the analysis found no evidence for. The text may say honestly that the person lacks it; it must not claim, imply or hedge toward having it ("familiar with", "exposure to").

Some items are not bullets but a CV's skills list or extras ("Category: skill; skill"), sourced from the person's own profile (skills list, location, links, languages, work authorization), their certifications and their evidence. Judge every entry: supported when the sources name it or plainly demonstrate it, in any wording or language ("ROAS optimization" over a record of raising ROAS is supported). Mark supported=false when any entry names a tool, platform, language, credential or competence the sources never show, and quote that entry in "reason".

"reason" is one sentence quoting the specific source wording that conflicts. Leave it empty when supported=true.

Return exactly one verdict per bullet id given to you.`

export type DistortionVerdict = { bulletId: string; supported: boolean; reason: string }

/**
 * Stage ④, the narrow model half of verification: one batched call at low
 * effort, run only on bullets that already cleared the code checks.
 */
export async function checkDistortions(
  bullets: { id: string; text: string; sources: string[] }[],
  /** The reasons are shown to the person under the flagged text, in their language. */
  reasonLanguage: 'en' | 'es' = 'es',
  targetTitle?: string,
): Promise<DistortionVerdict[]> {
  if (bullets.length === 0) return []

  const payload = bullets
    .map(
      (b) =>
        `<bullet id="${b.id}">\n  <text>${b.text}</text>\n  <sources>\n${b.sources.map((s) => `    - ${s}`).join('\n')}\n  </sources>\n</bullet>`,
    )
    .join('\n')

  const result = await callStructured({
    schema: VerdictsSchema,
    system: [{ text: SYSTEM, cache: true }],
    user: `${targetTitle?.trim() ? `The role being applied for (not one the person holds unless a source shows it): ${targetTitle.trim()}\n\n` : ''}<bullets>\n${payload}\n</bullets>\n\n${
      reasonLanguage === 'en'
        ? 'Write every "reason" in English.'
        : 'Write every "reason" in Mexican Spanish (es-MX); quote source wording exactly as written.'
    }`,
    effort: 'low',
    stage: 'verify-distortion',
  })

  return result.verdicts
}
