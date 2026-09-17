import type { Database } from 'better-sqlite3'
import { NextResponse } from 'next/server'
import { backupFilename, createBackup } from '@/lib/db/backup'
import { type Db, db } from '@/lib/db/client'

export async function GET() {
  // The exported `db` is a Proxy over the real drizzle handle and forwards
  // $client at runtime same as openDb()'s return does — its declared type
  // just doesn't say so, to keep every db.transaction() callback (which has
  // no $client) accepted by the same Db alias elsewhere.
  const bytes = await createBackup(db as Db & { $client: Database })
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${backupFilename()}"`,
    },
  })
}
