import { z } from 'zod'

export const GeneratedBulletSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  /** The whole grounding contract: which evidence items this sentence derives
   *  from. Deliberately NOT min(1): the grammar cannot carry minItems, so a
   *  min here never prevented an uncited bullet at generation — it only
   *  turned one into a fatal invalid-output at parse, making the
   *  uncitedBullets check and compose's purpose-built repair instruction for
   *  it unreachable. An empty array flows to the report and gets the one
   *  graceful repair the architecture already built for exactly this. */
  citedEvidenceIds: z.array(z.string()),
  keywordsUsed: z.array(z.string()),
})
export type GeneratedBullet = z.infer<typeof GeneratedBulletSchema>

export const CVRoleSchema = z.object({
  experienceId: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  // Strict YYYY-MM: a looser date ("2016", "Jan 2016") printed as
  // "undefined 2016" on the finished CV. Note the trade this makes: the
  // regex lives only in the local re-validation (no retry exists), so a
  // violation is a fatal invalid-output — accepted here because the model
  // copies these dates from evidence periods that are already YYYY-MM, which
  // makes the constraint satisfiable every time in a way free-text fields
  // are not.
  startDate: z.string().regex(/^\d{4}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  bullets: z.array(GeneratedBulletSchema),
})
export type CVRole = z.infer<typeof CVRoleSchema>

export const CVContentSchema = z.object({
  header: z.object({
    fullName: z.string().min(1),
    title: z.string(),
    contactLines: z.array(z.string()),
  }),
  summary: z.string(),
  experience: z.array(CVRoleSchema),
  education: z.array(z.object({ degree: z.string(), institution: z.string(), period: z.string() })),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  extras: z.array(z.object({ heading: z.string(), lines: z.array(z.string()) })),
})
export type CVContent = z.infer<typeof CVContentSchema>
