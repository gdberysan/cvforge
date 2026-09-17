import { z } from 'zod'
import { callStructured } from '../client'

const VerdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      bulletId: z.string(),
      supported: z.boolean(),
      reason: z.string(),
    }),
  ),
})

const SYSTEM = `You check whether a CV bullet overstates its source material.

For each bullet you are given its text and the full text of the evidence it cites. Answer one question: does the bullet assert anything its sources do not support?

Mark supported=false when the bullet:
- inflates scope or ownership ("led" where the source says "contributed to"; "single-handedly" where the source says "with the team")
- states an outcome the source only describes as an attempt or intention
- generalises one instance into a pattern ("routinely", "consistently") without support
- adds a technology, client, or responsibility absent from the sources
- speaks in the present tense about work whose source periods have all ended — each source line starts with its [start–end] period, and an ended engagement must not sound current

Mark supported=true when the bullet is a faithful rephrasing, compression, or reordering — even if the wording differs a lot from the source. Rephrasing is the point; only added claims are the problem.

"reason" is one sentence quoting the specific source wording that conflicts. Leave it empty when supported=true.

Return exactly one verdict per bullet id given to you.`

export type DistortionVerdict = { bulletId: string; supported: boolean; reason: string }

/**
 * Stage ④, the narrow model half of verification: one batched call at low
 * effort, run only on bullets that already cleared the code checks.
 */
export async function checkDistortions(
  bullets: { id: string; text: string; sources: string[] }[],
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
    user: `<bullets>\n${payload}\n</bullets>`,
    effort: 'low',
    stage: 'verify-distortion',
  })

  return result.verdicts
}
