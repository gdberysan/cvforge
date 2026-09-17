import { z } from 'zod'
import { MonthSchema, PeriodSchema } from './evidence'

export const MarketSchema = z.enum(['mx', 'us-remote', 'eu-remote'])
export type Market = z.infer<typeof MarketSchema>

export const ExperienceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  period: PeriodSchema,
  summary: z.string().default(''),
})
export type Experience = z.infer<typeof ExperienceSchema>

export const EducationSchema = z.object({
  id: z.string().min(1),
  /** Same reasoning as `Certification.issuer`: parse-cv's shared prompt says
   *  "If a field is absent, leave it empty", and a min(1) here made obeying
   *  that instruction fatal for the whole paid two-call import. A diploma
   *  course listed as just the institution and years — or a degree with the
   *  school omitted — is a real CV, not bad data. */
  degree: z.string().default(''),
  institution: z.string().default(''),
  /** Optional at both ends: "UNAM, 2015" is a graduation year with no start,
   *  and plenty of CVs list a degree with no dates at all. Requiring a start
   *  left the model two choices — invent a month or fail the paid import. */
  period: z.object({ start: MonthSchema.optional(), end: MonthSchema.optional() }).optional(),
})
export type Education = z.infer<typeof EducationSchema>

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  url: z.string().optional(),
  stack: z.array(z.string()).default([]),
})
export type Project = z.infer<typeof ProjectSchema>

export const CertificationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Same reasoning as `email`: a LinkedIn "Save to PDF" export prints
   *  certification names with no issuing organization, and the parse prompt
   *  orders absent fields left empty. Demanding one gave the model a choice
   *  between an empty string — which failed validation and killed a paid
   *  two-call import behind "unexpected shape" — and inventing an issuer. */
  issuer: z.string().default(''),
  date: z.string().optional(),
  url: z.string().optional(),
})
export type Certification = z.infer<typeof CertificationSchema>

export const MasterProfileSchema = z.object({
  basics: z.object({
    fullName: z.string().min(1),
    headline: z.string().default(''),
    /** Plain string on purpose: an imported CV may not state one, and the
     *  strength meter is the place to nag, not a validator that blocks. */
    email: z.string().default(''),
    phone: z.string().optional(),
    location: z.string().default(''),
    timezone: z.string().default('America/Mexico_City'),
    // Plain strings: CVs print "linkedin.com/in/x" without a scheme, and
    // what a CV states is valid data. A validator that rejects it at accept
    // time eats a paid parse.
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  }),
  summary: z.string().default(''),
  experience: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
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
  /** Gates remote roles: many postings require a specific permit or residency. */
  workAuthorization: z.array(z.object({ country: z.string(), status: z.string() })).default([]),
  preferences: z.object({
    targetTitles: z.array(z.string()).default([]),
    markets: z.array(MarketSchema).default([]),
  }),
  updatedAt: z.string().datetime(),
})
export type MasterProfile = z.infer<typeof MasterProfileSchema>
