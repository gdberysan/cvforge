import type { EvidenceItem, MasterProfile } from '@/lib/schemas'

/**
 * Where a record comes from, in words a person reads: the company, the
 * project's name, the school or the certification. Internal ids
 * (ev_4288222a) were shown in their place on Números and in the Studio —
 * meaningful to the database, noise to everyone else.
 */
export function sourceLabel(ref: EvidenceItem['sourceRef'], profile: MasterProfile | null): string {
  if (!profile) return ''
  switch (ref.type) {
    case 'experience': {
      const role = profile.experience.find((r) => r.id === ref.id)
      return role ? role.company || role.title : ''
    }
    case 'project':
      return profile.projects.find((p) => p.id === ref.id)?.name ?? ''
    case 'education': {
      const ed = profile.education.find((e) => e.id === ref.id)
      return ed ? ed.institution || ed.degree : ''
    }
    case 'certification':
      return profile.certifications.find((c) => c.id === ref.id)?.name ?? ''
  }
}

/** Every record's label, keyed by id — for client components that only get ids. */
export function sourceLabels(
  evidence: EvidenceItem[],
  profile: MasterProfile | null,
): Record<string, string> {
  return Object.fromEntries(evidence.map((e) => [e.id, sourceLabel(e.sourceRef, profile)]))
}
