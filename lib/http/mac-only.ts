import { headers } from 'next/headers'
import { doorOf } from './doors'

/**
 * Server actions post to page URLs, so the guard cannot tell one from
 * another by path. The few that replace secrets call this first: null when
 * the request came from the Mac itself, a refusal otherwise.
 */
export async function macOnlyRefusal(): Promise<{
  ok: false
  error: string
  code: 'mac-only'
} | null> {
  const door = doorOf(await headers())
  return door === 'local'
    ? null
    : { ok: false, error: 'Only from the Mac itself.', code: 'mac-only' }
}
