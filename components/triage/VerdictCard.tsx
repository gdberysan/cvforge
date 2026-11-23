'use client'

import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { IconCheck, IconInfo, IconXCircle } from '@/components/ui/icons'
import { companyName } from '@/lib/company-name'
import { VERDICT_KEYS } from '@/lib/coverage'
import type { Coverage, EvidenceMapping, Requirement } from '@/lib/schemas'
import { CoverageBar } from './CoverageBar'
import { GateList } from './GateList'

/** How many missing things the one-line summary names before "and N more". */
const NAMED = 4

/**
 * The answer, as in the mockup (friendly redesign 2026-11-21): a gate first
 * when there is one (skip is a gate, never folded away), then the verdict in
 * one word with an icon, how much of what they require you have, what is
 * missing in one sentence, the reasons behind "Ver por qué", and one big
 * button for the move the analysis recommends.
 */
export function VerdictCard({
  company,
  jobTitle,
  coverage,
  requirements,
  mappings,
  onSkip,
  onSaveForLater,
  onBuild,
  example = false,
}: {
  company: string
  jobTitle: string
  coverage: Coverage
  requirements: Requirement[]
  mappings: EvidenceMapping[]
  onSkip: () => void
  onSaveForLater: () => void
  onBuild: () => void
  /** An example (the first run's sample): the answer only, nothing to act on. */
  example?: boolean
}) {
  const t = useT()
  const locale = useLocale()
  const copy = VERDICT_KEYS[coverage.verdict]
  const mappingOf = new Map(mappings.map((m) => [m.requirementId, m]))
  const gaps = requirements.filter((r) => r.mandatory && mappingOf.get(r.id)?.strength !== 'strong')
  const worthBuilding = coverage.verdict === 'strong' || coverage.verdict === 'worth-it'
  const named = gaps.slice(0, NAMED).map((g) => g.keyword)
  const more = gaps.length - named.length
  const list = new Intl.ListFormat(locale === 'es' ? 'es' : 'en', {
    style: 'long',
    type: 'conjunction',
  }).format(more > 0 ? [...named, t('verdict.more', { n: more })] : named)
  const Icon = worthBuilding ? IconCheck : coverage.verdict === 'skip' ? IconXCircle : IconInfo

  return (
    <section className={`answer-card answer-${coverage.verdict}`} aria-labelledby="answer-word">
      {/* Blockers first. They end the decision, so nothing is read before them. */}
      <GateList requirements={coverage.hardBlockers} tone="blocked" />
      <GateList requirements={coverage.unjudgedGates ?? []} tone="unjudged" />

      <div className="answer-head">
        <span className="answer-icon" aria-hidden>
          <Icon />
        </span>
        <div>
          <h2 id="answer-word" className="answer-word">
            {t(copy.label)}
          </h2>
          <p className="answer-role">
            {companyName(company) ? `${jobTitle} · ${companyName(company)}` : jobTitle}
          </p>
        </div>
      </div>
      <p className="answer-detail">{t(copy.detail)}</p>

      <CoverageBar coverage={coverage} />

      {gaps.length > 0 && (
        <div className="answer-gaps">
          <h3>{t('verdict.gaps')}</h3>
          <p>{list}.</p>
        </div>
      )}

      {gaps.length > 0 && (
        <details className="story-why">
          <summary>{t('story.why')}</summary>
          <ul className="answer-reasons">
            {gaps.map((g) => {
              const m = mappingOf.get(g.id)
              return (
                <li key={g.id} className={m?.strength === 'partial' ? 'is-partial' : 'is-missing'}>
                  <span className="answer-reason-name">{g.keyword}</span>
                  <span className="answer-reason-why">
                    {m?.unjudged
                      ? t('verdict.unjudgedOne')
                      : m?.rationale || t('verdict.noEvidence')}
                  </span>
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {/* The big button is always what the analysis just recommended; the
          interface never argues with its own advice. On a phone the row is
          pinned above the bottom bar (.phone-footer). */}
      {!example && (
        <div className="answer-actions phone-footer">
          {worthBuilding ? (
            <>
              <button type="button" className="btn btn-primary answer-main" onClick={onBuild}>
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
              <button type="button" className="btn btn-primary answer-main" onClick={onSkip}>
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
      )}
    </section>
  )
}
