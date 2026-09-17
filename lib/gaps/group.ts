import type { InterviewAnswer } from '@/lib/schemas'

/** One gap the user wrote against, plus the role they said it happened at. */
export type GapEntry = {
  requirementId: string
  roleId: string
  /** The template prompt shown beside the gap, kept verbatim for the transcript. */
  question: string
  answer: string
}

export type RoleGroup = { roleId: string; answers: InterviewAnswer[] }

/**
 * `structureAnswers` is per-role and takes ownership from the role the caller
 * hands it, so entries must be grouped before any model call. Grouping here —
 * rather than asking the model to sort it out — is what keeps attribution
 * deterministic: nothing ever decides which employer a skill belongs to except
 * the person who lived it. That is the version of this feature that could
 * otherwise put a real lie on a CV.
 *
 * A blank answer or an unchosen role drops the entry. Skipping a gap has to
 * cost nothing, or the incentive runs toward stretching.
 */
export function groupEntriesByRole(entries: GapEntry[]): RoleGroup[] {
  const groups = new Map<string, InterviewAnswer[]>()

  for (const entry of entries) {
    const roleId = entry.roleId.trim()
    if (entry.answer.trim().length === 0 || roleId.length === 0) continue
    const answers = groups.get(roleId) ?? []
    answers.push({
      questionId: entry.requirementId,
      question: entry.question,
      answer: entry.answer,
    })
    groups.set(roleId, answers)
  }

  return [...groups].map(([roleId, answers]) => ({ roleId, answers }))
}
