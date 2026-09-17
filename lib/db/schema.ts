import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { MasterProfile, Metric } from '@/lib/schemas'

/**
 * Storage shape (spec §4): relational tables for anything the stats layer will
 * aggregate over; typed JSON columns for leaf blobs. Normalising a generated
 * cover letter into rows buys nothing and costs schema churn.
 */

/** Single-row table. `id` is always 'singleton'. */
export const profile = sqliteTable('profile', {
  id: text('id').primaryKey().default('singleton'),
  data: text('data', { mode: 'json' }).$type<MasterProfile>().notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const evidenceItems = sqliteTable(
  'evidence_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind', {
      enum: ['achievement', 'project-highlight', 'credential', 'skill-claim'],
    }).notNull(),
    sourceType: text('source_type', {
      enum: ['experience', 'project', 'education', 'certification'],
    }).notNull(),
    sourceId: text('source_id').notNull(),
    text: text('text').notNull(),
    metrics: text('metrics', { mode: 'json' }).$type<Metric[]>().notNull().default(sql`'[]'`),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end'),
    strength: text('strength', { enum: ['core', 'supporting'] }).notNull(),
    origin: text('origin', { enum: ['import', 'interview', 'manual', 'gap-fill'] })
      .notNull()
      .default('manual'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('evidence_source_idx').on(t.sourceType, t.sourceId)],
)

export const interviewSessions = sqliteTable(
  'interview_sessions',
  {
    id: text('id').primaryKey(),
    roleId: text('role_id').notNull(),
    /** The verbatim Q&A, kept for its own sake — the evidence this session
     *  produced is what a CV cites, but the original question is what makes
     *  an old answer legible as "what did I actually say about this role"
     *  months later, independent of how the model later condensed it. */
    answers: text('answers', { mode: 'json' })
      .$type<{ question: string; answer: string }[]>()
      .notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('interview_sessions_role_idx').on(t.roleId)],
)

export const applications = sqliteTable(
  'applications',
  {
    id: text('id').primaryKey(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    source: text('source', {
      enum: ['occ', 'computrabajo', 'linkedin', 'indeed', 'company-site', 'referral', 'other'],
    }).notNull(),
    sourceUrl: text('source_url'),
    company: text('company').notNull(),
    jobTitle: text('job_title').notNull(),
    market: text('market', { enum: ['mx', 'us-remote', 'eu-remote'] }).notNull(),
    documentLanguage: text('document_language', { enum: ['en', 'es-MX'] }).notNull(),
    postingRaw: text('posting_raw').notNull(),
    postingHash: text('posting_hash').notNull(),
    /**
     * Hash of the evidence projection the mappings were computed against.
     * NULL means unknown (pre-dates the column) and reads as stale, so the
     * next re-paste re-maps instead of serving a frozen verdict.
     */
    evidenceHash: text('evidence_hash'),
    /** Denormalised from outcome_events by deriveStatus(); never set directly. */
    status: text('status').notNull().default('triaged'),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes').notNull().default(''),
    coverage: text('coverage', { mode: 'json' }),
    documents: text('documents', { mode: 'json' }),
    groundingReport: text('grounding_report', { mode: 'json' }),
  },
  (t) => [index('applications_hash_idx').on(t.postingHash)],
)

export const requirements = sqliteTable(
  'requirements',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    keyword: text('keyword').notNull(),
    variants: text('variants', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    kind: text('kind', {
      enum: ['hard', 'soft', 'location', 'timezone', 'authorization'],
    }).notNull(),
    mandatory: integer('mandatory', { mode: 'boolean' }).notNull(),
    weight: integer('weight').notNull().default(2),
  },
  (t) => [index('requirements_app_idx').on(t.applicationId)],
)

export const mappings = sqliteTable(
  'mappings',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    requirementId: text('requirement_id')
      .notNull()
      .references(() => requirements.id, { onDelete: 'cascade' }),
    evidenceIds: text('evidence_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    strength: text('strength', { enum: ['strong', 'partial', 'none'] }).notNull(),
    rationale: text('rationale').notNull().default(''),
  },
  (t) => [index('mappings_app_idx').on(t.applicationId)],
)

/**
 * One row per model call. Token counts are the API's own usage figures;
 * cost is computed at write time from the pinned model's rates, so the
 * counter in the nav is a sum, not a recomputation.
 */
export const apiCalls = sqliteTable('api_calls', {
  id: text('id').primaryKey(),
  at: text('at').notNull().default(sql`CURRENT_TIMESTAMP`),
  stage: text('stage').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
})

/**
 * The answer bank (spec §7): portals ask the same thirty questions forever.
 * Keyed by the normalized question so cosmetic variants land on one row;
 * language is part of the key because an answer is written, not translated.
 */
export const answerBank = sqliteTable(
  'answer_bank',
  {
    id: text('id').primaryKey(),
    questionKey: text('question_key').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    language: text('language', { enum: ['en', 'es-MX'] }).notNull(),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('answer_bank_key_idx').on(t.questionKey, t.language)],
)

export const outcomeEvents = sqliteTable(
  'outcome_events',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    at: text('at').notNull(),
    type: text('type', {
      enum: [
        'applied',
        'acknowledged',
        'screen',
        'interview',
        'offer',
        'rejected',
        'withdrawn',
        'ghosted',
      ],
    }).notNull(),
    note: text('note'),
  },
  (t) => [index('outcome_app_idx').on(t.applicationId)],
)

/**
 * Unused by the app. Kept because shipped migrations created it and existing
 * databases carry it; dropping it would need a migration of its own.
 */
export const dismissedJobs = sqliteTable('dismissed_jobs', {
  jobId: text('job_id').primaryKey(),
  dismissedAt: text('dismissed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})
