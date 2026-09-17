'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { acceptGapEvidenceAction } from '@/app/(app)/application/[id]/gaps/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { ApiFailure } from '@/lib/api-failure'
import { requestRemap } from '@/lib/gaps/remap-request'
import type { GapSelection } from '@/lib/gaps/select'
import { errorText, plural } from '@/lib/i18n'
import type { EvidenceItem, Experience, Market } from '@/lib/schemas'

type Stage = 'writing' | 'drafting' | 'review' | 'saving'
type Entry = { roleId: string; answer: string }

/**
 * One textarea per gap, with the prompt as visible hint text and a role picker
 * beside it. Not one field per prompt: six gaps times four fields is
 * twenty-four boxes, and nobody finishes that.
 *
 * Submitting stays disabled until at least one gap has BOTH prose and a role.
 * Leaving a gap alone is the frictionless path on purpose — if "I don't have
 * this" cost a click while "I sort of have this" cost a sentence, the
 * incentive would run toward stretching.
 */
export function GapFill({
  applicationId,
  selection,
  roles,
  postingRaw,
  market,
}: {
  applicationId: string
  selection: GapSelection
  roles: Experience[]
  postingRaw: string
  market: Market
}) {
  const t = useT()
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('writing')
  // Expanded from the start when nothing mandatory is missing: otherwise the
  // screen promises gaps and renders no fields, and a posting whose misses are
  // all partial or optional just looks broken.
  const [showSecondary, setShowSecondary] = useState(selection.primary.length === 0)
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [dropped, setDropped] = useState<{ evidenceId: string; raw: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [, startSave] = useTransition()

  const gaps = [...selection.primary, ...(showSecondary ? selection.secondary : [])]
  const answered = Object.entries(entries).filter(
    ([, e]) => e.answer.trim().length > 0 && e.roleId.length > 0,
  )
  const busy = stage === 'drafting' || stage === 'saving'

  function set(requirementId: string, patch: Partial<Entry>) {
    setEntries((prev) => {
      const current: Entry = prev[requirementId] ?? { roleId: '', answer: '' }
      return { ...prev, [requirementId]: { ...current, ...patch } }
    })
  }

  async function draft() {
    setStage('drafting')
    setError(null)
    try {
      const res = await fetch('/api/ai/gaps', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          entries: answered.map(([requirementId, entry]) => ({
            requirementId,
            roleId: entry.roleId,
            question: t('gaps.prompt'),
            answer: entry.answer,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new ApiFailure(data.error, data.code)
      setEvidence(data.evidence)
      setDropped(data.dropped)
      setStage('review')
    } catch (e) {
      setError(
        e instanceof ApiFailure
          ? errorText(t, e.code, e.message)
          : e instanceof Error
            ? e.message
            : t('gaps.error.draft'),
      )
      setStage('writing')
    }
  }

  function accept() {
    setStage('saving')
    setError(null)
    startSave(async () => {
      const result = await acceptGapEvidenceAction({ applicationId, evidence })
      if (!result.ok) {
        setError(errorText(t, result.code, result.error))
        setStage('review')
        return
      }
      try {
        await requestRemap({ postingRaw, market })
      } catch {
        // The evidence is saved either way. A failed re-score just leaves the
        // application stale, and the existing banner already offers the retry.
      }
      // The pre-remap snapshot rides back to the application page, which
      // renders the delta against freshly loaded data.
      const before = encodeURIComponent(JSON.stringify(result.before))
      router.push(`/application/${applicationId}?gapdelta=${before}`)
    })
  }

  return (
    <div>
      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-4)' }}>
          {error}
        </p>
      )}

      {selection.blockers.length > 0 && (
        <p className="fact" style={{ marginTop: 'var(--space-5)', maxWidth: '38em' }}>
          {t('gaps.blockers')}
        </p>
      )}

      {(stage === 'writing' || stage === 'drafting') && (
        <>
          <ul
            className="stack"
            style={{
              listStyle: 'none',
              padding: 0,
              gap: 'var(--space-7)',
              marginTop: 'var(--space-6)',
            }}
          >
            {gaps.map((gap) => (
              <li key={gap.requirement.id}>
                <p className="fact" style={{ color: 'var(--text-strong)' }}>
                  {gap.requirement.keyword}
                  <span style={{ color: 'var(--text-muted)' }}>
                    {'  ·  '}
                    {t(
                      gap.requirement.mandatory ? 'application.required' : 'application.preferred',
                    )}
                    {'  ·  '}
                    {t(`strengthOf.${gap.strength}`)}
                  </span>
                </p>
                <p
                  style={{
                    color: 'var(--text-muted)',
                    font: 'var(--type-body-sm)',
                    marginTop: 'var(--space-1)',
                  }}
                >
                  {gap.rationale || gap.requirement.text}
                </p>

                <label
                  htmlFor={`role-${gap.requirement.id}`}
                  className="fact-label"
                  style={{ display: 'block', marginTop: 'var(--space-4)' }}
                >
                  {t('gaps.rolePick')}
                </label>
                <select
                  id={`role-${gap.requirement.id}`}
                  className="field"
                  value={entries[gap.requirement.id]?.roleId ?? ''}
                  onChange={(e) => set(gap.requirement.id, { roleId: e.target.value })}
                >
                  <option value="">{t('gaps.rolePlaceholder')}</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title} — {role.company}
                    </option>
                  ))}
                </select>

                <label
                  htmlFor={`answer-${gap.requirement.id}`}
                  className="fact-label"
                  style={{ display: 'block', marginTop: 'var(--space-4)' }}
                >
                  {t('gaps.prompt')}
                </label>
                <AutoTextarea
                  id={`answer-${gap.requirement.id}`}
                  value={entries[gap.requirement.id]?.answer ?? ''}
                  onChange={(e) => set(gap.requirement.id, { answer: e.target.value })}
                  minRows={3}
                  placeholder={t('gaps.answerPlaceholder')}
                  className="field"
                  style={{ marginTop: 'var(--space-2)' }}
                />
              </li>
            ))}
          </ul>

          {selection.secondary.length > 0 && (
            <button
              type="button"
              className="action"
              onClick={() => setShowSecondary((v) => !v)}
              // Block: `.action` is inline, so the submit button below shared
              // its line and the two overlapped.
              style={{ display: 'block', marginTop: 'var(--space-5)' }}
            >
              {showSecondary
                ? t('gaps.otherHide')
                : t('gaps.otherShow', { n: selection.secondary.length })}
            </button>
          )}

          <button
            type="button"
            onClick={draft}
            disabled={busy || answered.length === 0}
            className="btn btn-primary"
            style={{ marginTop: 'var(--space-7)' }}
          >
            {stage === 'drafting' ? t('gaps.building') : t('gaps.submit')}
          </button>
        </>
      )}

      {(stage === 'review' || stage === 'saving') && (
        <>
          {dropped.length > 0 && (
            <div style={{ marginTop: 'var(--space-5)', maxWidth: '38em' }}>
              <p style={{ color: 'var(--text-muted)', lineHeight: 'var(--leading-relaxed)' }}>
                {plural(t, dropped.length, 'gaps.dropped')}
              </p>

              {/* Shown, not merely counted. Seeing the exact figure that was
                  removed is what makes the guarantee checkable — and tells you
                  what to put back if it was true all along. */}
              <ul
                className="stack"
                style={{
                  listStyle: 'none',
                  padding: 0,
                  gap: 'var(--space-2)',
                  marginTop: 'var(--space-3)',
                }}
              >
                {dropped.map((d) => (
                  <li
                    key={`${d.evidenceId}-${d.raw}`}
                    className="fact"
                    style={{
                      color: 'var(--text-muted)',
                      textDecoration: 'line-through',
                      textDecorationColor: 'var(--signal-error)',
                    }}
                  >
                    {d.raw}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* An empty draft is a real outcome, not a failure: it means the
              answer described work this role's records already cover, and the
              dedupe rule declined to record it twice. Saying so beats a save
              button that would bank nothing and pay for a re-score anyway. */}
          {evidence.length === 0 ? (
            <>
              <p
                style={{
                  color: 'var(--text-body)',
                  marginTop: 'var(--space-6)',
                  maxWidth: '38em',
                }}
              >
                {t('gaps.nothingNew')}
              </p>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setStage('writing')}
                style={{ marginTop: 'var(--space-5)' }}
              >
                {t('gaps.nothingNewBack')}
              </button>
            </>
          ) : (
            <>
              <p className="eyebrow" style={{ marginTop: 'var(--space-6)' }}>
                {t('gaps.reviewTitle')}
              </p>
              <ul
                className="stack"
                style={{
                  listStyle: 'none',
                  padding: 0,
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-4)',
                }}
              >
                {evidence.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      background: 'var(--surface-card)',
                      border: '1px solid var(--border-subtle)',
                      borderLeft: '2px solid var(--accent)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-4)',
                    }}
                  >
                    <span className="ident">
                      {roles.find((r) => r.id === item.sourceRef.id)?.company ?? item.sourceRef.id}
                    </span>
                    <p style={{ color: 'var(--text-body)', marginTop: 'var(--space-2)' }}>
                      {item.text}
                    </p>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={accept}
                disabled={busy}
                className="btn btn-primary"
                style={{ marginTop: 'var(--space-7)' }}
              >
                {stage === 'saving' ? t('gaps.rescoring') : t('gaps.accept')}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
