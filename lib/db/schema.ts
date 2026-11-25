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
    market: text('market').notNull(),
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
    /**
     * Other names the employer writes under — names, or email domains
     * (`pavo.mx`). Only the user sets them (lib/company-aliases.ts); the job
     * agent's mail pass ties a reply by the company OR any of these.
     */
    companyAliases: text('company_aliases', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
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
  /**
   * 0 for a call that was sent and never answered here — the page closed or
   * the phone froze it mid-call — so its tokens and cost are not known. It
   * may still have been billed: the total says how many such calls exist
   * rather than counting them as free.
   */
  costKnown: integer('cost_known', { mode: 'boolean' }).notNull().default(true),
  /**
   * What the call was for (lib/ai/spend-context.ts): the action the person
   * started ('analysis', 'cv', 'import'…), its application when it has one,
   * and the run that groups its calls. Null where it is not known for sure
   * (calls before 2026-11-23, or two browser runs that overlapped): never
   * a guess.
   */
  action: text('action'),
  applicationId: text('application_id'),
  runId: text('run_id'),
})

/**
 * Paid calls in flight, written before a call is sent and removed once it
 * ends (web edition). A row still here when the database opens is a call
 * the page did not live to see answered: it becomes an api_calls row with
 * an unknown cost (lib/db/queries/spend.ts).
 */
export const openCalls = sqliteTable('open_calls', {
  id: text('id').primaryKey(),
  stage: text('stage').notNull(),
  model: text('model').notNull(),
  startedAt: text('started_at').notNull().default(sql`CURRENT_TIMESTAMP`),
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
  // Deliberately not UNIQUE. upsertAnswer is the only writer, in this process,
  // and its select-then-write runs in one synchronous better-sqlite3
  // transaction — two writes cannot interleave. A UNIQUE index would need a
  // migration that dedupes buyers' rows, for no change in behaviour.
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
    /** When the interview/screen takes place (ISO date or datetime); null when unknown. */
    scheduledAt: text('scheduled_at'),
    /** The call's Teams/Meet/Zoom link, read from its invite; null when unknown. */
    meetingUrl: text('meeting_url'),
  },
  (t) => [index('outcome_app_idx').on(t.applicationId)],
)

/**
 * The people on an application (spec 2026-10-18 Part A): who he is meeting.
 * Names and roles come from invites and from what an email states — a role
 * nobody stated stays ''. A `manual` row is his and the agent never changes
 * it; a hidden one is a deletion the agent must not undo.
 */
export const applicationPeople = sqliteTable(
  'application_people',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    outcomeEventId: text('outcome_event_id').references(() => outcomeEvents.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    email: text('email').notNull().default(''),
    role: text('role').notNull().default(''),
    /** The exact sentence the role came from; '' when typed by hand or unknown. */
    roleQuote: text('role_quote').notNull().default(''),
    source: text('source', { enum: ['invite', 'mail', 'manual'] }).notNull(),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('people_app_idx').on(t.applicationId)],
)

/** A generated interview prep; the newest per (application, language) is shown. */
export const interviewPreps = sqliteTable(
  'interview_preps',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    outcomeEventId: text('outcome_event_id'),
    language: text('language', { enum: ['en', 'es-MX'] }).notNull(),
    content: text('content', { mode: 'json' }).notNull(),
    report: text('report', { mode: 'json' }).notNull(),
    /** Evidence projection hash at generation; a mismatch reads as stale. */
    evidenceHash: text('evidence_hash').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('preps_app_idx').on(t.applicationId)],
)

/**
 * What he typed into a story's open slot. Kept apart from any prep so a
 * regenerate never loses his words; every prep is given them back.
 */
export const prepAnswers = sqliteTable(
  'prep_answers',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    evidenceIds: text('evidence_ids', { mode: 'json' }).$type<string[]>().notNull(),
    // S/T/A/R: a part of a story; Q: his answer to an interview question;
    // D: his notes after a round. A text column: no migration to widen it.
    part: text('part', { enum: ['S', 'T', 'A', 'R', 'Q', 'D', 'C', 'P'] }).notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('prep_answers_app_idx').on(t.applicationId)],
)

/**
 * Discover-only: LinkedIn job ids the user hid from search results. The table
 * exists in every build (migrations are shared), but only the flag-gated
 * /discover page ever reads or writes it — buyer installs carry it empty.
 */
export const dismissedJobs = sqliteTable('dismissed_jobs', {
  jobId: text('job_id').primaryKey(),
  dismissedAt: text('dismissed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

/**
 * Base CVs: composed once from the whole evidence base for a kind of role,
 * not for one posting, then reused across applications for free. Stored as
 * structured content like an application's CV, so the same templates render
 * it and the same code checks re-run when it is applied.
 */
export const cvVariants = sqliteTable('cv_variants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  focus: text('focus').notNull(),
  language: text('language', { enum: ['en', 'es-MX'] }).notNull(),
  market: text('market').notNull(),
  cv: text('cv', { mode: 'json' }),
  report: text('report', { mode: 'json' }),
  /** Evidence projection hash at compose time; a mismatch reads as stale. */
  evidenceHash: text('evidence_hash'),
  composedAt: text('composed_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

/** A device that receives push notifications (spec 2026-10-15 §5). */
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  label: text('label').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  lastOkAt: text('last_ok_at'),
})

/** Notifications held back by quiet hours; the server's flush loop sends them. */
export const pushOutbox = sqliteTable('push_outbox', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  url: text('url').notNull(),
  sendAfter: text('send_after').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

/**
 * Kits the server prepares in the background after a chase (spec
 * 2026-10-15 agent stage A §6): the CV, then the cover letter. A table, not
 * memory, because an install restarts the server and a kit must survive it.
 * `state` is queued | running | done | failed; `notBefore` holds a failed
 * kit's one retry until 03:00 the next night.
 */
export const kitJobs = sqliteTable('kit_jobs', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull(),
  state: text('state').notNull(),
  attempts: integer('attempts').notNull().default(0),
  errorCode: text('error_code'),
  notBefore: text('not_before'),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
})

/**
 * Follow-up emails drafted for a quiet application (spec 2026-10-16 agent
 * stage B §5). Only the newest per application is shown; older rows stay for
 * the count. `to` is '' when no real reply address is known. `usedAt` is set
 * when the user says he sent it — CVForge never sends mail itself.
 */
export const followUpDrafts = sqliteTable(
  'follow_up_drafts',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
    to: text('to').notNull().default(''),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    usedAt: text('used_at'),
  },
  (t) => [index('follow_up_drafts_app_idx').on(t.applicationId)],
)
