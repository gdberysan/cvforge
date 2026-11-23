import Database from 'better-sqlite3'
import { desc } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { applications } from '@/lib/db/schema'
import { storedMs } from '@/lib/time'

/**
 * The titles the job agent looks for (spec 2026-10-17 §6, ruling I2): a
 * satellite setting (`searchTitles`), edited from Ajustes → Agente. It is
 * NOT the profile's target titles — those feed the CVs and the evidence
 * projection, and this editor never writes them. The agent's free title
 * screen (lib/agent/relevance.ts → agentRelevance) reads these; the editor
 * previews that screen on the user's own recent postings.
 */

export const MAX_SEARCH_TITLES = 30
export const MAX_SEARCH_TITLE_LENGTH = 80
export const PREVIEW_SIZE = 12
/** At most this many of the samples are postings the screen dropped, so the preview is not all "kept". */
const DROPPED_SAMPLES = 6

export type TitlesCode = 'invalid-request' | 'titles-too-many' | 'title-too-long'

/** Trimmed, blanks dropped, deduped case-insensitively, order kept. Refused, never truncated. */
export function normalizeSearchTitles(
  input: unknown,
): { ok: true; titles: string[] } | { ok: false; code: TitlesCode } {
  if (!Array.isArray(input) || input.some((x) => typeof x !== 'string')) {
    return { ok: false, code: 'invalid-request' }
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input as string[]) {
    const title = raw.trim()
    if (!title) continue
    if (title.length > MAX_SEARCH_TITLE_LENGTH) return { ok: false, code: 'title-too-long' }
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(title)
  }
  if (out.length > MAX_SEARCH_TITLES) return { ok: false, code: 'titles-too-many' }
  return { ok: true, titles: out }
}

/** SQLite's CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS', UTC) or an ISO string, as ms. */
function ms(at: string): number {
  const t = storedMs(at)
  return Number.isNaN(t) ? 0 : t
}

type Sample = { title: string; at: number }

function readAgent(file: string | undefined, fn: (db: Database.Database) => Sample[]): Sample[] {
  if (!file) return []
  let db: Database.Database
  try {
    db = new Database(file, { readonly: true, fileMustExist: true })
  } catch {
    return []
  }
  try {
    db.pragma('busy_timeout = 1000')
    return fn(db)
  } catch {
    // An older agent without the table or column, or a busy file: none.
    return []
  } finally {
    db.close()
  }
}

/** The agent's finds (`shown_postings`): judged and kept. */
function agentFinds(file: string | undefined): Sample[] {
  return readAgent(file, (db) => {
    const rows = db
      .prepare('SELECT data, created_at FROM shown_postings ORDER BY created_at DESC LIMIT ?')
      .all(PREVIEW_SIZE * 2) as { data: string; created_at: string }[]
    const out: Sample[] = []
    for (const r of rows) {
      try {
        const title = (JSON.parse(r.data) as { jobTitle?: unknown }).jobTitle
        if (typeof title === 'string' && title.trim()) out.push({ title, at: ms(r.created_at) })
      } catch {
        // A row this code cannot read is skipped, never a broken Ajustes.
      }
    }
    return out
  })
}

/** What the agent screened, with titles (`judged_postings.title`, recorded since 2026-10-17). */
function agentJudged(file: string | undefined, dropped: boolean): Sample[] {
  return readAgent(file, (db) =>
    (
      db
        .prepare(
          `SELECT title, judged_at FROM judged_postings WHERE title IS NOT NULL AND title != '' AND verdict ${dropped ? '' : 'NOT '}LIKE 'drop:%' ORDER BY judged_at DESC LIMIT ?`,
        )
        .all(PREVIEW_SIZE * 2) as { title: string; judged_at: string }[]
    ).map((r) => ({ title: r.title, at: ms(r.judged_at) })),
  )
}

/**
 * Sample titles for the preview: up to 6 the agent's screen dropped, the
 * rest its finds, what it judged and the applications (archived ones too —
 * a skipped posting is still one the user saw). Each title once, at most
 * 12, newest first.
 */
export function recentPostingTitles(satelliteFile: string | undefined, db: Db): string[] {
  const apps = db
    .select({ title: applications.jobTitle, at: applications.createdAt })
    .from(applications)
    .orderBy(desc(applications.createdAt))
    .limit(PREVIEW_SIZE * 2)
    .all()
    .map((r) => ({ title: r.title, at: ms(r.at) }))
  const byDate = (a: Sample, b: Sample) => b.at - a.at
  const dropped = agentJudged(satelliteFile, true).sort(byDate).slice(0, DROPPED_SAMPLES)
  const rest = [...agentFinds(satelliteFile), ...agentJudged(satelliteFile, false), ...apps].sort(
    byDate,
  )
  const picked: Sample[] = []
  const seen = new Set<string>()
  for (const s of [...dropped, ...rest]) {
    const key = s.title.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    picked.push({ title: s.title.trim(), at: s.at })
    if (picked.length >= PREVIEW_SIZE) break
  }
  return picked.sort(byDate).map((s) => s.title)
}
