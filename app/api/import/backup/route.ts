import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validateBackup } from '@/lib/db/backup'
import { restoreDatabase } from '@/lib/db/client'
import { DatabaseInUseError } from '@/lib/db/restore'
import { demoBlock, isDemo } from '@/lib/demo/mode'
import { isSameOriginRequest } from '@/lib/http/same-origin'

const MAX_BACKUP_BYTES = 50 * 1024 * 1024
/** Base64 inflates by 4/3; anything past this decodes to more than 50MB. */
const MAX_BACKUP_BASE64 = Math.ceil(MAX_BACKUP_BYTES / 3) * 4

const Body = z.object({ backup: z.string().min(100).max(MAX_BACKUP_BASE64) })

/**
 * Replaces the entire database with an uploaded backup. Destructive and
 * irreversible — everything currently stored is gone the moment this
 * succeeds — so it gets the same same-origin proof /api/shutdown does: a
 * cross-origin POST is a "simple request", and without this check any page
 * the user's browser visits could silently wipe their data.
 */
export async function POST(request: Request) {
  if (isDemo()) return NextResponse.json(demoBlock(), { status: 403 })

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'forbidden', code: 'forbidden' }, { status: 403 })
  }

  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json(
      { error: 'That file is too large or not a backup at all.', code: 'invalid-request' },
      { status: 400 },
    )
  }

  const bytes = Buffer.from(body.data.backup, 'base64')
  const check = validateBackup(bytes)
  if (!check.ok) {
    return NextResponse.json(
      { error: 'That file is not a CVForge backup.', code: check.error },
      {
        status: 422,
      },
    )
  }

  try {
    restoreDatabase(bytes)
  } catch (error) {
    if (error instanceof DatabaseInUseError) {
      return NextResponse.json(
        { error: 'Another program has the database open.', code: 'database-in-use' },
        { status: 409 },
      )
    }
    throw error
  }
  return NextResponse.json({ ok: true })
}
