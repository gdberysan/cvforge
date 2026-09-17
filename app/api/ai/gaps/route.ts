import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AiError } from '@/lib/ai/errors'
import { structureAnswers } from '@/lib/ai/stages/interview'
import { db } from '@/lib/db/client'
import { listEvidence } from '@/lib/db/queries/evidence'
import { getProfile } from '@/lib/db/queries/profile'
import { isDemo } from '@/lib/demo/mode'
import { groupEntriesByRole } from '@/lib/gaps/group'
import type { EvidenceItem } from '@/lib/schemas'

const Body = z.object({
  applicationId: z.string().min(1),
  entries: z
    .array(
      z.object({
        requirementId: z.string().min(1),
        roleId: z.string().min(1),
        question: z.string().min(1),
        answer: z.string().min(1),
      }),
    )
    .min(1),
})

/**
 * Drafts evidence from what the user wrote against a posting's gaps. Saves
 * nothing — the review screen decides that, and the accept action writes it.
 *
 * Entries are grouped by role before any call, so `structureAnswers` sets each
 * record's employer from a role the USER picked. The model is never asked
 * which job a skill belongs to, because that is the mistake that would put a
 * real lie on a CV.
 */
export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => undefined))
  if (!body.success) {
    return NextResponse.json(
      { error: 'Invalid request.', code: 'invalid-request' },
      { status: 400 },
    )
  }

  if (isDemo()) {
    return NextResponse.json(
      { error: 'Demo is read-only.', code: 'demo-read-only' },
      { status: 409 },
    )
  }

  const profile = getProfile(db)
  if (!profile) {
    return NextResponse.json({ error: 'No profile yet.', code: 'no-profile' }, { status: 404 })
  }

  const groups = groupEntriesByRole(body.data.entries)
  if (groups.length === 0) {
    return NextResponse.json(
      { error: 'Nothing to record.', code: 'invalid-request' },
      { status: 400 },
    )
  }

  const withRoles = groups.map((group) => ({
    group,
    role: profile.experience.find((r) => r.id === group.roleId),
  }))
  if (withRoles.some((r) => !r.role)) {
    return NextResponse.json({ error: 'Role not found.', code: 'role-not-found' }, { status: 404 })
  }

  const allEvidence = listEvidence(db)

  try {
    const evidence: EvidenceItem[] = []
    const dropped: { evidenceId: string; raw: string }[] = []

    // Sequential, not parallel: every call is paid, and a failure on the second
    // group should not leave the first group's spend unexplained in the counter.
    for (const { group, role } of withRoles) {
      if (!role) continue
      const result = await structureAnswers({
        role,
        stubs: [],
        existing: allEvidence.filter(
          (e) => e.sourceRef.type === 'experience' && e.sourceRef.id === role.id,
        ),
        answers: group.answers,
      })
      // Origin is ours, not the stage's: these records were written against a
      // demanded requirement, and that provenance is the audit trail.
      evidence.push(...result.evidence.map((item) => ({ ...item, origin: 'gap-fill' as const })))
      dropped.push(...result.dropped)
    }

    return NextResponse.json({ evidence, dropped })
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.userMessage, code: error.kind }, { status: 502 })
    }
    return NextResponse.json(
      { error: 'Unexpected error while recording those gaps.', code: 'unexpected' },
      { status: 500 },
    )
  }
}
