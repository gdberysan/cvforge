import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { type Db, openDb, runMigrations } from '@/lib/db/client'

/**
 * 1.2.17 reserved `skip` for a real gate, which left every stored `skip` that
 * came from the old count rule displaying the gate's explanation — "a
 * requirement no rewriting can meet" — on a posting nothing gates. The verdict
 * is derived data, a pure function of requirements and mappings, so it is
 * recomputed rather than left to misdescribe itself.
 */
const MIGRATION = path.join(process.cwd(), 'drizzle', '0007_verdict_gate_only.sql')

function withDb(fn: (db: Db) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvforge-'))
  const { db, close } = openDb(path.join(dir, 'test.db'))
  try {
    runMigrations(db)
    fn(db)
  } finally {
    close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const insert = (db: Db, id: string, coverage: unknown) =>
  db.run(
    sql`INSERT INTO applications (id, source, company, job_title, market, document_language, posting_raw, posting_hash, coverage)
        VALUES (${id}, 'other', 'C', 'T', 'mx', 'es', 'raw', ${id}, ${JSON.stringify(coverage)})`,
  )

const verdictOf = (db: Db, id: string) =>
  db.get<{ v: string }>(
    sql`SELECT json_extract(coverage, '$.verdict') AS v FROM applications WHERE id = ${id}`,
  ).v

/** The shipped file, run the way the migrator runs it. */
const applyMigration = (db: Db) => {
  for (const stmt of readFileSync(MIGRATION, 'utf8').split('--> statement-breakpoint')) {
    if (stmt.trim()) db.run(sql.raw(stmt))
  }
}

describe('0007 verdict backfill', () => {
  it('rewrites a skip that nothing gated into stretch', () => {
    withDb((db) => {
      insert(db, 'a1', { verdict: 'skip', hardBlockers: [] })
      applyMigration(db)
      expect(verdictOf(db, 'a1')).toBe('stretch')
    })
  })

  it('leaves a genuinely gated skip alone', () => {
    withDb((db) => {
      insert(db, 'a2', { verdict: 'skip', hardBlockers: [{ id: 'r1', kind: 'location' }] })
      applyMigration(db)
      expect(verdictOf(db, 'a2')).toBe('skip')
    })
  })

  it('does not touch any other verdict', () => {
    withDb((db) => {
      insert(db, 'a3', { verdict: 'stretch', hardBlockers: [] })
      insert(db, 'a4', { verdict: 'worth-it', hardBlockers: [] })
      insert(db, 'a5', { verdict: 'strong', hardBlockers: [] })
      applyMigration(db)
      expect(verdictOf(db, 'a3')).toBe('stretch')
      expect(verdictOf(db, 'a4')).toBe('worth-it')
      expect(verdictOf(db, 'a5')).toBe('strong')
    })
  })

  it('survives a row whose coverage was never computed', () => {
    withDb((db) => {
      db.run(
        sql`INSERT INTO applications (id, source, company, job_title, market, document_language, posting_raw, posting_hash)
            VALUES ('a6', 'other', 'C', 'T', 'mx', 'es', 'raw', 'h6')`,
      )
      expect(() => applyMigration(db)).not.toThrow()
    })
  })
})
