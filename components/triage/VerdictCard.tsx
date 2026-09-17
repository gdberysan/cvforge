'use client'

import { useT } from '@/components/i18n/LocaleProvider'
import { VERDICT_COLOR, VERDICT_KEYS } from '@/lib/coverage'
import type { Coverage, EvidenceMapping, Requirement } from '@/lib/schemas'
import { CoverageBar } from './CoverageBar'

export function VerdictCard({
  company,
  jobTitle,
  coverage,
  requirements,
  mappings,
  onSkip,
  onSaveForLater,
  onBuild,
}: {
  company: string
  jobTitle: string
  coverage: Coverage
  requirements: Requirement[]
  mappings: EvidenceMapping[]
  onSkip: () => void
  onSaveForLater: () => void
  onBuild: () => void
}) {
  const t = useT()
  const copy = VERDICT_KEYS[coverage.verdict]
  const mappingOf = new Map(mappings.map((m) => [m.requirementId, m]))
  const gaps = requirements.filter((r) => r.mandatory && mappingOf.get(r.id)?.strength !== 'strong')
  const worthBuilding = coverage.verdict === 'strong' || coverage.verdict === 'worth-it'

  return (
    <section
      style={{
        marginTop: 'var(--space-6)',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--edge-top)',
      }}
    >
      {/* Blockers first. They end the decision, so nothing should be read before them. */}
      {coverage.hardBlockers.length > 0 && (
        <div
          style={{
            border: '1px solid var(--signal-error)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-5)',
          }}
        >
          <p className="fact-label" style={{ color: 'var(--signal-error)' }}>
            {t('verdict.blocked')}
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 'var(--space-3) 0 0',
              display: 'grid',
              gap: 'var(--space-2)',
            }}
          >
            {coverage.hardBlockers.map((b) => (
              <li key={b.id} style={{ color: 'var(--text-body)', font: 'var(--type-body-sm)' }}>
                <span className="fact-label" style={{ marginRight: 'var(--space-2)' }}>
                  {t(`kind.${b.kind}`)}
                </span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="eyebrow">{t('verdict.eyebrow')}</p>
      <h2
        style={{
          font: 'var(--type-h3)',
          color: VERDICT_COLOR[coverage.verdict],
          marginTop: 'var(--space-2)',
        }}
      >
        {t(copy.label)}
      </h2>
      <p style={{ color: 'var(--text-body)', marginTop: 'var(--space-2)' }}>{t(copy.detail)}</p>
      <p className="fact" style={{ color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>
        {jobTitle} @ {company}
      </p>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <CoverageBar coverage={coverage} />
      </div>

      {gaps.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <p className="eyebrow">{t('verdict.gaps')}</p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 'var(--space-3) 0 0',
              display: 'grid',
              gap: 'var(--space-3)',
            }}
          >
            {gaps.map((g) => {
              const m = mappingOf.get(g.id)
              const partial = m?.strength === 'partial'
              return (
                <li
                  key={g.id}
                  style={{
                    font: 'var(--type-body-sm)',
                    color: 'var(--text-body)',
                    borderLeft: `2px solid ${partial ? 'var(--graphite-200)' : 'var(--signal-error)'}`,
                    paddingLeft: 'var(--space-3)',
                  }}
                >
                  <span className="fact" style={{ color: 'var(--text-strong)' }}>
                    {g.keyword}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' — '}
                    {m?.rationale || t('verdict.noEvidence')}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* The emphasis follows the verdict. Offering a bright "Build materials"
          under advice to skip would have the interface argue with itself; the
          amber button is always the thing the analysis just recommended. */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-7)',
          flexWrap: 'wrap',
        }}
      >
        {worthBuilding ? (
          <>
            <button type="button" className="btn btn-primary" onClick={onBuild}>
              {t('verdict.build')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={onSaveForLater}>
              {t('verdict.save')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onSkip}>
              {t('verdict.skip')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onSkip}>
              {t('verdict.next')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={onSaveForLater}>
              {t('verdict.save')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onBuild}>
              {t('verdict.buildAnyway')}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
