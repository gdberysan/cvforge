import { z } from 'zod'
import { readPeriod, UndatedRoleError } from '@/lib/import/dates'
import { EvidenceItemSchema, type Period } from './evidence'
import { deriveCurrency } from './metric'
import {
  CertificationSchema,
  EducationSchema,
  ExperienceSchema,
  MasterProfileSchema,
  ProjectSchema,
} from './profile'

/**
 * The output of CV import. Deliberately named a *skeleton*: a CV is already
 * compressed and trimmed, so its bullets are stubs. The guided interview is
 * what turns them into evidence (spec §5.3).
 */
export const ParsedCVSchema = z.object({
  profile: MasterProfileSchema,
  evidence: z.array(EvidenceItemSchema),
})
export type ParsedCV = z.infer<typeof ParsedCVSchema>

/**
 * The model-facing contract for CV parsing — only what a CV can actually
 * state. Everything the code owns (evidence origin, timezone default,
 * preferences, work authorization, updatedAt) is absent: the full ParsedCV
 * grammar was rejected by the API as too large to enforce, and a model
 * should never be asked to emit fields it can only invent. Email is a plain
 * string for the same reason — a CV without one must not force a fake.
 */
/**
 * The model-facing period: plain strings, both optional. A YYYY-MM `pattern`
 * would be prose the API does not enforce, and a required start would force
 * a month onto every undated degree, project stub or course — invent one or
 * fail the paid import. `lib/import/dates.ts` reads what came back.
 */
const SkeletonPeriodSchema = z.object({ start: z.string().optional(), end: z.string().optional() })

export const CvSkeletonSchema = z.object({
  basics: z.object({
    fullName: z.string().min(1),
    headline: z.string().default(''),
    email: z.string().default(''),
    phone: z.string().optional(),
    location: z.string().default(''),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  }),
  summary: z.string().default(''),
  experience: z.array(ExperienceSchema.extend({ period: SkeletonPeriodSchema })).default([]),
  education: z
    .array(EducationSchema.extend({ period: SkeletonPeriodSchema.optional() }))
    .default([]),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })).default([]),
  languages: z
    .array(
      z.object({
        language: z.string(),
        level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native']),
      }),
    )
    .default([]),
  certifications: z.array(CertificationSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  evidence: z
    .array(
      EvidenceItemSchema.omit({ origin: true }).extend({ period: SkeletonPeriodSchema.optional() }),
    )
    .default([]),
})
export type CvSkeleton = z.infer<typeof CvSkeletonSchema>

/**
 * Even the slim skeleton is too much for one API-enforced grammar — each
 * probe slice fits, the union does not. Parsing therefore runs as two
 * calls: the profile shape first, then evidence bound to its assigned ids.
 */
export const CvProfileSkeletonSchema = CvSkeletonSchema.omit({ evidence: true })
export type CvProfileSkeleton = z.infer<typeof CvProfileSkeletonSchema>

export const CvEvidenceSkeletonSchema = z.object({
  evidence: CvSkeletonSchema.shape.evidence,
})

/**
 * Roles the CV gives no readable dates for, labelled for the user. Checked
 * right after the profile pass so an undated CV stops before the second paid
 * call, not after it.
 */
export function undatedRoles(experience: CvProfileSkeleton['experience']): string[] {
  return experience
    .filter((role) => {
      const read = readPeriod(role.period)
      return !read.start || read.unreadableEnd
    })
    .map((role) => `${role.title} at ${role.company}`)
}

export type ImportResult = { parsed: ParsedCV; problems: string[] }

/**
 * Fills in the code-owned fields the skeleton deliberately lacks, and reads
 * every date. Nothing here invents a date: an achievement with no date of its
 * own takes the period of the role or degree it belongs to (it happened
 * there), and one with nowhere to inherit from is left out and reported, so
 * the review screen says what was skipped instead of storing a made-up month.
 */
export function toParsedCV(skeleton: CvSkeleton): ImportResult {
  const undated = undatedRoles(skeleton.experience)
  if (undated.length > 0) throw new UndatedRoleError(undated)

  const problems: string[] = []

  const experience = skeleton.experience.map((role) => {
    const { start, end } = readPeriod(role.period)
    return { ...role, period: { start: start as string, ...(end ? { end } : {}) } }
  })

  const education = skeleton.education.map((entry) => {
    const { start, end, unreadableEnd } = readPeriod(entry.period)
    // An unreadable end on a degree is dropped rather than read as ongoing:
    // with no start either, the entry simply stays undated.
    const period: { start?: string; end?: string } | undefined =
      start || end ? { ...(start ? { start } : {}), ...(end ? { end } : {}) } : undefined
    if (unreadableEnd) problems.push(`Could not read the end date of education "${entry.id}".`)
    return { ...entry, period }
  })

  const inherited = new Map<string, Period>()
  for (const role of experience) inherited.set(`experience:${role.id}`, role.period)
  for (const entry of education) {
    if (entry.period?.start) {
      inherited.set(`education:${entry.id}`, {
        start: entry.period.start,
        ...(entry.period.end ? { end: entry.period.end } : {}),
      })
    }
  }

  const evidence: ParsedCV['evidence'] = []
  for (const item of skeleton.evidence) {
    const own = readPeriod(item.period)
    const period: Period | undefined =
      own.start && !own.unreadableEnd
        ? { start: own.start, ...(own.end ? { end: own.end } : {}) }
        : inherited.get(`${item.sourceRef.type}:${item.sourceRef.id}`)
    if (!period) {
      // A degree or certification restated as an achievement is still on
      // file as a credential; saying "not imported" about it would be false.
      problems.push(
        item.sourceRef.type === 'education' || item.sourceRef.type === 'certification'
          ? `Kept as a credential only — the CV gives no date for an achievement: "${item.text}".`
          : `Left out — the CV gives this achievement no date: "${item.text}". Add it by hand from Evidence.`,
      )
      continue
    }
    evidence.push({
      ...item,
      period,
      origin: 'import' as const,
      // A unit that names a currency IS the currency (see deriveCurrency).
      metrics: item.metrics.map(deriveCurrency),
    })
  }

  return {
    parsed: {
      profile: {
        basics: { ...skeleton.basics, timezone: 'America/Mexico_City' },
        summary: skeleton.summary,
        experience,
        education,
        skills: skeleton.skills,
        languages: skeleton.languages,
        certifications: skeleton.certifications,
        projects: skeleton.projects,
        workAuthorization: [],
        preferences: { targetTitles: [], markets: [] },
        // Placeholder — acceptImportAction stamps the real time on save.
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
      evidence,
    },
    problems,
  }
}
