import { eq } from 'drizzle-orm'
import { type MasterProfile, MasterProfileSchema } from '@/lib/schemas'
import type { Db } from '../client'
import { profile } from '../schema'

const SINGLETON = 'singleton'

export function getProfile(db: Db): MasterProfile | null {
  const row = db.select().from(profile).where(eq(profile.id, SINGLETON)).get()
  if (!row) return null
  return MasterProfileSchema.parse(row.data)
}

export function saveProfile(db: Db, data: MasterProfile): void {
  const validated = MasterProfileSchema.parse(data)
  const updatedAt = new Date().toISOString()
  db.insert(profile)
    .values({ id: SINGLETON, data: validated, updatedAt })
    .onConflictDoUpdate({ target: profile.id, set: { data: validated, updatedAt } })
    .run()
}
