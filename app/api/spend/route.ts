import { NextResponse } from 'next/server'
import type { SpendAction } from '@/lib/ai/spend-context'
import { db } from '@/lib/db/client'
import { applicationSpend, typicalRunCost } from '@/lib/db/queries/spend'

/**
 * What the paid buttons say before they are pressed: each action's usual
 * cost here (the median of its own runs), and with ?applicationId= what
 * that application has cost so far. Read-only; no model is called.
 */
const ACTIONS: SpendAction[] = [
  'analysis',
  'cv',
  'letter',
  'answers',
  'message',
  'prep',
  'import',
  'gaps',
  'base-cv',
]

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('applicationId')
  const typical = Object.fromEntries(ACTIONS.map((a) => [a, typicalRunCost(db, a)]))
  return NextResponse.json(
    { typical, application: id ? applicationSpend(db, id) : null },
    { headers: { 'cache-control': 'no-store' } },
  )
}
