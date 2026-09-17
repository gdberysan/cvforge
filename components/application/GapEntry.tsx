import Link from 'next/link'
import { GapDelta } from '@/components/application/GapDelta'
import { computeDelta, SnapshotSchema, takeSnapshot } from '@/lib/gaps/delta'
import { selectGaps } from '@/lib/gaps/select'
import type { Translate } from '@/lib/i18n'
import { plural } from '@/lib/i18n'
import type { Coverage, EvidenceMapping, Requirement } from '@/lib/schemas'

/**
 * The link into gap-fill, plus the delta from a run that just finished.
 *
 * Both live here rather than inline on the application page: that page is
 * already long, and the delta needs an untrusted search param parsed
 * defensively, which reads badly as an expression in the middle of JSX.
 */
export function GapEntry({
  t,
  applicationId,
  coverage,
  requirements,
  mappings,
  gapdelta,
}: {
  t: Translate
  applicationId: string
  coverage: Coverage
  requirements: Requirement[]
  mappings: EvidenceMapping[]
  /** The pre-remap snapshot, URL-encoded by GapFill. Untrusted. */
  gapdelta?: string
}) {
  const selection = selectGaps(requirements, mappings)
  const delta = parseSnapshot(gapdelta)

  return (
    <>
      {(selection.primary.length > 0 || selection.secondary.length > 0) && (
        <p className="fact" style={{ marginTop: 'var(--space-5)', maxWidth: '38em' }}>
          {/* Counting only the unmet mandatory requirements would announce
              "0 required things have nothing behind them" above a link to five
              real gaps, whenever a posting's misses are all partial or
              optional. Say what is actually there instead. */}
          {selection.primary.length > 0
            ? plural(t, selection.primary.length, 'gaps.entry')
            : plural(t, selection.secondary.length, 'gaps.entryPartial')}{' '}
          <Link href={`/application/${applicationId}/gaps`} className="action">
            {t('gaps.entryLink')}
          </Link>
        </p>
      )}

      {delta && (
        <GapDelta delta={computeDelta(delta, takeSnapshot({ coverage, mappings }), requirements)} />
      )}
    </>
  )
}

/**
 * A hand-edited URL must render nothing rather than crash the page, so the
 * JSON parse and the schema check both fail closed.
 */
function parseSnapshot(raw: string | undefined) {
  if (!raw) return null
  try {
    const parsed = SnapshotSchema.safeParse(JSON.parse(decodeURIComponent(raw)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
