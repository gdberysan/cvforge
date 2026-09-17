import { computeCoverage } from '@/lib/coverage'
import type {
  Coverage,
  EvidenceItem,
  EvidenceMapping,
  MasterProfile,
  Requirement,
} from '@/lib/schemas'
import { buildEvidenceProjection, citableIds } from './projection'
import { extractRequirements } from './stages/extract-requirements'
import { mapEvidence } from './stages/map-evidence'

/** Real stages, not a fake timeline — each maps to one call in this function. */
export type TriageStage = 'extracting' | 'mapping' | 'saving'

export type TriageResult = {
  company: string
  jobTitle: string
  language: 'en' | 'es-MX'
  companyTone: string
  requirements: Requirement[]
  mappings: EvidenceMapping[]
  coverage: Coverage
}

/**
 * Stage ② only: re-map stored requirements against the current evidence base.
 * This is what runs when a cached posting's verdict has gone stale — the
 * posting has not changed, so extraction is not repeated.
 */
export async function runRemap(args: {
  requirements: Requirement[]
  profile: MasterProfile
  evidence: EvidenceItem[]
  onProgress?: (stage: TriageStage, detail?: string) => void
}): Promise<{ mappings: EvidenceMapping[]; coverage: Coverage }> {
  args.onProgress?.(
    'mapping',
    `${args.requirements.length} requirements · ${args.evidence.length} records`,
  )
  const mappings = await mapEvidence({
    requirements: args.requirements,
    projection: buildEvidenceProjection(args.profile, args.evidence),
    // Evidence records plus the credential lines (certifications, education,
    // languages) — a posting that requires a certification the person holds
    // must be able to map to it.
    validEvidenceIds: citableIds(args.profile, args.evidence),
  })

  // Computed here, never taken from the model.
  return { mappings, coverage: computeCoverage(args.requirements, mappings) }
}

/**
 * Stages ① and ② only. This IS the fast lane — it is not a separate feature
 * with its own code path, it is the pipeline stopping after mapping.
 */
export async function runTriage(args: {
  postingText: string
  profile: MasterProfile
  evidence: EvidenceItem[]
  onProgress?: (stage: TriageStage, detail?: string) => void
}): Promise<TriageResult> {
  args.onProgress?.('extracting')
  const extracted = await extractRequirements(args.postingText)

  const { mappings, coverage } = await runRemap({
    requirements: extracted.requirements,
    profile: args.profile,
    evidence: args.evidence,
    onProgress: args.onProgress,
  })

  return {
    company: extracted.company,
    jobTitle: extracted.jobTitle,
    language: extracted.language,
    companyTone: extracted.companyTone,
    requirements: extracted.requirements,
    mappings,
    coverage,
  }
}
