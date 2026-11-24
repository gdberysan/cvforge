import { z } from 'zod'
import {
  IncompleteRoleError,
  MissingNameError,
  readPeriod,
  UndatedRoleError,
} from '@/lib/import/dates'
import { serverTimeZone } from '@/lib/time'
import { EvidenceItemSchema, ModelEvidenceSchema, type Period, readModelEvidence } from './evidence'
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
    // Plain string, like the role fields below: a minimum length is prose to
    // the API, and a CV whose name sits in an image or a page header the
    // reader missed would fail the paid import here with nothing to say. An
    // empty name stops the import before the second call (MissingNameError).
    fullName: z.string().describe('{minLength: 1}'),
    headline: z.string().default(''),
    email: z.string().default(''),
    phone: z.string().optional(),
    location: z.string().default(''),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  }),
  summary: z.string().default(''),
  // Ids, titles, employers and names are plain strings here: a minimum
  // length is prose to the API and failed the paid import on an empty one.
  // toParsedCV fills a missing id, and a role without employer or title
  // stops the import (IncompleteRoleError) rather than being invented.
  experience: z
    .array(
      ExperienceSchema.extend({
        id: z.string(),
        title: z.string(),
        company: z.string(),
        period: SkeletonPeriodSchema,
      }),
    )
    .default([]),
  education: z
    .array(EducationSchema.extend({ id: z.string(), period: SkeletonPeriodSchema.optional() }))
    .default([]),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })).default([]),
  languages: z
    .array(
      z.object({
        language: z.string(),
        // As the CV words it ("Avanzado", "C1", "Nativo"): a CEFR enum made
        // the model invent a level or fail the import. Read by readLevel.
        level: z.string(),
      }),
    )
    .default([]),
  certifications: z
    .array(CertificationSchema.extend({ id: z.string(), name: z.string() }))
    .default([]),
  projects: z
    .array(
      ProjectSchema.extend({
        id: z.string(),
        name: z.string(),
        period: SkeletonPeriodSchema.optional(),
      }),
    )
    .default([]),
  evidence: z.array(ModelEvidenceSchema).default([]),
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

/** Roles the CV names without an employer or a title, labelled for the user. */
export function incompleteRoles(experience: CvProfileSkeleton['experience']): string[] {
  return experience
    .filter((role) => !role.title.trim() || !role.company.trim())
    .map((role) => role.title.trim() || role.company.trim() || role.id || '(unnamed role)')
}

type Level = ParsedCV['profile']['languages'][number]['level']
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

/**
 * A language level as a CV words it, read into the stored scale. A code or a
 * native/bilingual statement is exact. A described level ("Avanzado") is an
 * estimate, so it comes back with `estimated` and the review screen says so;
 * a level that cannot be read comes back undefined.
 */
export function readLevel(text: string): { level: Level; estimated: boolean } | undefined {
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  const code = t.match(/(?<![a-z0-9])([abc][12])(?![a-z0-9])/)?.[1]?.toUpperCase()
  if (code && (CEFR as readonly string[]).includes(code))
    return { level: code as Level, estimated: false }
  if (/nativ|materna|mother tongue|bilingu/.test(t)) return { level: 'native', estimated: false }
  if (/upper.?intermedi|intermedio alto|intermedio-alto/.test(t))
    return { level: 'B2', estimated: true }
  if (/fluid|fluent|avanzad|advanced|profici|dominio|profesional|professional/.test(t))
    return { level: 'C1', estimated: true }
  if (/intermedi|conversa/.test(t)) return { level: 'B1', estimated: true }
  if (/basic|basico|elementa|principiante|beginner/.test(t)) return { level: 'A2', estimated: true }
  return undefined
}

/**
 * Something an import left out or guessed, said on the review screen in the
 * person's language: a code and its details, never a sentence built here
 * (the screen translates it through the dictionary).
 */
export type ImportProblem =
  | { code: 'language-unread'; language: string; level: string }
  | { code: 'language-estimated'; language: string; level: string; read: string }
  | { code: 'education-end-unread'; name: string }
  | { code: 'project-end-unread'; name: string }
  | { code: 'evidence-unplaceable'; text: string }
  | { code: 'evidence-undated'; text: string }
  | { code: 'credential-undated'; text: string }
  | { code: 'duplicate-id'; id: string }
  | { code: 'unknown-ref'; id: string }

/** A read span with its year-only flags, or undefined when nothing was read. */
function spanOf(
  start: string | undefined,
  end: string | undefined,
  startYearOnly?: boolean,
  endYearOnly?: boolean,
): { start?: string; end?: string; startYearOnly?: boolean; endYearOnly?: boolean } | undefined {
  if (!start && !end) return undefined
  return {
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(start && startYearOnly ? { startYearOnly: true } : {}),
    ...(end && endYearOnly ? { endYearOnly: true } : {}),
  }
}

export type ImportResult = { parsed: ParsedCV; problems: ImportProblem[] }

/**
 * Fills in the code-owned fields the skeleton deliberately lacks, and reads
 * every date. Nothing here invents a date: an achievement with no date of its
 * own takes the period of the role or degree it belongs to (it happened
 * there), and one with nowhere to inherit from is left out and reported, so
 * the review screen says what was skipped instead of storing a made-up month.
 */
export function toParsedCV(skeleton: CvSkeleton): ImportResult {
  if (!skeleton.basics.fullName.trim()) throw new MissingNameError()
  const undated = undatedRoles(skeleton.experience)
  if (undated.length > 0) throw new UndatedRoleError(undated)
  const incomplete = incompleteRoles(skeleton.experience)
  if (incomplete.length > 0) throw new IncompleteRoleError(incomplete)

  const problems: ImportProblem[] = []
  // A missing id is filled, never fatal: evidence binds to the ids the
  // profile pass assigned, so a filled one simply has nothing bound to it.
  const idOr = (id: string, fallback: string) => id.trim() || fallback

  const experience = skeleton.experience.map((role, i) => {
    const { start, end, startYearOnly, endYearOnly } = readPeriod(role.period)
    return {
      ...role,
      id: idOr(role.id, `exp_${i + 1}`),
      title: role.title.trim(),
      company: role.company.trim(),
      period: {
        start: start as string,
        ...(end ? { end } : {}),
        ...(startYearOnly ? { startYearOnly } : {}),
        ...(end && endYearOnly ? { endYearOnly } : {}),
      },
    }
  })

  const languages = skeleton.languages.flatMap((entry) => {
    const read = readLevel(entry.level)
    if (!read) {
      problems.push({ code: 'language-unread', language: entry.language, level: entry.level })
      return []
    }
    if (read.estimated)
      problems.push({
        code: 'language-estimated',
        language: entry.language,
        level: entry.level,
        read: read.level,
      })
    return [{ language: entry.language, level: read.level }]
  })

  const certifications = skeleton.certifications.flatMap((c, i) =>
    c.name.trim() ? [{ ...c, id: idOr(c.id, `cert_${i + 1}`), name: c.name.trim() }] : [],
  )

  const education = skeleton.education.map((entry, i) => {
    const { start, end, unreadableEnd, startYearOnly, endYearOnly } = readPeriod(entry.period)
    // An unreadable end on a degree is dropped rather than read as ongoing:
    // with no start either, the entry simply stays undated.
    const period = spanOf(start, end, startYearOnly, endYearOnly)
    if (unreadableEnd)
      problems.push({
        code: 'education-end-unread',
        name: entry.degree.trim() || entry.institution.trim() || entry.id,
      })
    return { ...entry, id: idOr(entry.id, `edu_${i + 1}`), period }
  })

  // Read exactly like a degree's: a project the CV gives no dates for stays
  // undated, and its achievements are reported rather than given a month.
  const projects = skeleton.projects.flatMap((entry, i) => {
    if (!entry.name.trim()) return []
    const { start, end, unreadableEnd, startYearOnly, endYearOnly } = readPeriod(entry.period)
    const period = spanOf(start, end, startYearOnly, endYearOnly)
    if (unreadableEnd) problems.push({ code: 'project-end-unread', name: entry.name.trim() })
    return [{ ...entry, id: idOr(entry.id, `proj_${i + 1}`), name: entry.name.trim(), period }]
  })

  const inherited = new Map<string, Period>()
  for (const role of experience) inherited.set(`experience:${role.id}`, role.period)
  for (const [type, entries] of [
    ['education', education],
    ['project', projects],
  ] as const) {
    for (const entry of entries) {
      if (!entry.period?.start) continue
      inherited.set(`${type}:${entry.id}`, {
        ...entry.period,
        start: entry.period.start,
      })
    }
  }

  const evidence: ParsedCV['evidence'] = []
  for (const [i, raw] of skeleton.evidence.entries()) {
    const read = readModelEvidence(raw)
    if (!read.ok) {
      if (read.reason === 'unplaceable')
        problems.push({ code: 'evidence-unplaceable', text: raw.text.trim() })
      continue
    }
    const item = { ...read.fields, id: idOr(raw.id, `ev_${i + 1}`), period: raw.period }
    const own = readPeriod(item.period)
    const period: Period | undefined =
      own.start && !own.unreadableEnd
        ? (spanOf(own.start, own.end, own.startYearOnly, own.endYearOnly) as Period)
        : inherited.get(`${item.sourceRef.type}:${item.sourceRef.id}`)
    if (!period) {
      // A degree or certification restated as an achievement is still on
      // file as a credential; saying "not imported" about it would be false.
      problems.push({
        code:
          item.sourceRef.type === 'education' || item.sourceRef.type === 'certification'
            ? 'credential-undated'
            : 'evidence-undated',
        text: item.text,
      })
      continue
    }
    // Metrics come back from readModelEvidence already read: an empty one
    // dropped, an unknown direction left out, the currency derived.
    evidence.push({ ...item, period, origin: 'import' as const })
  }

  return {
    parsed: {
      profile: {
        basics: {
          ...skeleton.basics,
          fullName: skeleton.basics.fullName.trim(),
          timezone: serverTimeZone(),
        },
        summary: skeleton.summary,
        experience,
        education,
        skills: skeleton.skills,
        languages,
        certifications,
        projects,
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
