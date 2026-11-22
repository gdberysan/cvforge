import { credentialSources } from '@/lib/ai/projection'
import { sourceLabels } from '@/lib/evidence-label'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'

export type ResolvedSource = { id: string; text: string | null; label: string }

/**
 * What a mapping's citations point at, as the user would read them. The
 * mapper may cite an evidence record or a credential line (a language, a
 * degree, a certification — projection.citableIds), so both resolve here.
 * text null means the id is in neither: a record deleted since the analysis.
 */
export function resolveSources(
  ids: string[],
  profile: MasterProfile | null,
  evidence: EvidenceItem[],
): ResolvedSource[] {
  const byId = new Map(evidence.map((e) => [e.id, e]))
  const labels = sourceLabels(evidence, profile)
  const credentials = profile ? credentialSources(profile) : new Map<string, string>()
  return ids.map((id) => {
    const e = byId.get(id)
    if (e) return { id, text: e.text, label: labels[id] ?? '' }
    const line = credentials.get(id)
    // "id | kind | text | date" → the text and date, without the machine columns.
    if (line) return { id, text: line.split(' | ').slice(2).join(' · '), label: '' }
    return { id, text: null, label: '' }
  })
}
