import type { Config } from 'drizzle-kit'

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.CVFORGE_DB_PATH ?? './data/cvforge.db' },
} satisfies Config
