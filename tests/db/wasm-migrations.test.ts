import { readMigrationFiles } from 'drizzle-orm/migrator'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '@/lib/db/wasm/migrations.gen'

describe('the web edition’s bundled migrations', () => {
  it('match drizzle/ exactly (run `npm run db:bundle` after `db:generate`)', () => {
    expect(MIGRATIONS).toEqual(readMigrationFiles({ migrationsFolder: 'drizzle' }))
  })
})
