import { z } from 'zod'

export const OutcomeTypeSchema = z.enum([
  'applied',
  'acknowledged',
  'screen',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'ghosted',
])
export type OutcomeType = z.infer<typeof OutcomeTypeSchema>

export const OutcomeEventSchema = z.object({
  at: z.string().datetime(),
  type: OutcomeTypeSchema,
  note: z.string().optional(),
})
export type OutcomeEvent = z.infer<typeof OutcomeEventSchema>

export const ApplicationStatusSchema = z.enum([
  'triaged',
  'drafting',
  'applied',
  'interviewing',
  'offer',
  'closed',
  'archived',
])
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>

export const SourceSchema = z.enum([
  'occ',
  'computrabajo',
  'linkedin',
  'indeed',
  'company-site',
  'referral',
  'other',
])
export type Source = z.infer<typeof SourceSchema>

export const DocumentLanguageSchema = z.enum(['en', 'es-MX'])
export type DocumentLanguage = z.infer<typeof DocumentLanguageSchema>
