/**
 * The request grammar the model is sent for every model-facing schema,
 * as zodOutputFormat builds it (CLAUDE.md: "before any zod bump, dump that
 * output for every model-facing schema and diff it"). Prints stable JSON:
 *
 *   npx tsx scripts/schema-grammar.ts > before.json   # on the current zod
 *   (bump)                                            # then again, and diff
 *
 * The list is every `schema:` handed to callStructured; a new one belongs here.
 */
import { existsSync } from 'node:fs'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ZodType } from 'zod'
import { PostingTranscriptSchema } from '@/lib/ai/stages/transcribe-posting'
import { CVTranslationSchema } from '@/lib/ai/stages/translate-cv'
import { VerdictsSchema } from '@/lib/ai/stages/verify-distortion'
import {
  ModelCoverLetterSchema,
  ModelRecruiterMessageSchema,
  ModelScreeningAnswerSchema,
  ModelScreeningSetSchema,
} from '@/lib/schemas/companion'
import { CVDraftSchema } from '@/lib/schemas/cv'
import { CvEvidenceSkeletonSchema, CvProfileSkeletonSchema } from '@/lib/schemas/import'
import { InterviewPlanSchema, InterviewResultSchema } from '@/lib/schemas/interview'
import { MappingResultSchema } from '@/lib/schemas/mapping'
import { ModelPrepSchema } from '@/lib/schemas/prep'
import { ModelExtractionSchema } from '@/lib/schemas/requirement'

const SCHEMAS: Record<string, ZodType> = {
  CVDraftSchema,
  CVTranslationSchema,
  ModelCoverLetterSchema,
  CvEvidenceSkeletonSchema,
  CvProfileSkeletonSchema,
  InterviewPlanSchema,
  InterviewResultSchema,
  MappingResultSchema,
  ModelExtractionSchema,
  ModelPrepSchema,
  PostingTranscriptSchema,
  ModelRecruiterMessageSchema,
  ModelScreeningAnswerSchema,
  ModelScreeningSetSchema,
  VerdictsSchema,
}

// The job agent's own model calls, where the agent is part of the tree.
// Named by a variable, so the open-source tree (which has neither file)
// still type-checks.
const agentSchemas: [string, string, string][] = [
  ['../lib/followup/draft.ts', 'FollowUpDraftSchema', 'lib/followup/draft.ts'],
  ['../lib/mail/classify-outcome.ts', 'MailOutcomeSchema', 'lib/mail/classify-outcome.ts'],
]
for (const [specifier, name, file] of agentSchemas) {
  if (!existsSync(file)) continue
  const mod = (await import(specifier)) as Record<string, ZodType>
  const schema = mod[name]
  if (schema) SCHEMAS[name] = schema
}

const grammar = Object.fromEntries(
  Object.keys(SCHEMAS)
    .sort()
    .map((name) => [name, zodOutputFormat(SCHEMAS[name] as never)]),
)
// Functions (the local parser) are not part of what is sent.
console.log(JSON.stringify(grammar, (_k, v) => (typeof v === 'function' ? undefined : v), 2))
