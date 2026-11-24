'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { acceptGapEvidenceAction } from '@/app/(app)/application/[id]/gaps/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { CostNote } from '@/components/ui/CostNote'
import { IconPlus } from '@/components/ui/icons'
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
  // Each gap is a line until you say you have done it: only then its form.
  // Answering is for what you really did, so the default is closed.
  const [opened, setOpened] = useState<Set<string>>(new Set())
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
      // Roles whose call failed: the rest is kept, and these are named so the
      // person can save what finished and answer them again.
      if (data.unfinished?.length)
        setError(t('gaps.unfinished', { roles: data.unfinished.join('; ') }))
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
      router.push(`/application/${applicationId}?step=gaps&gapdelta=${before}`)
    })
  }

  return (
    <div className="gapfill">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {selection.blockers.length > 0 && <p className="note">{t('gaps.blockers')}</p>}

      {(stage === 'writing' || stage === 'drafting') && (
        <>
          <ol className="gap-list">
            {gaps.map((gap, i) => (
              <li key={gap.requirement.id} className="gap-item">
                <div className="gap-head">
                  <span className="gap-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="gap-name">{gap.requirement.keyword}</h3>
                  {/* Tags on their own row, whatever the title's length. */}
                  <span className="gap-tags">
                    <span className="tag">
                      {t(
                        gap.requirement.mandatory
                          ? 'application.required'
                          : 'application.preferred',
                      )}
                    </span>
                    <span className={`tag tone-${gap.strength}`}>
                      {t(`gaps.tag.${gap.strength}`)}
                    </span>
                  </span>
                </div>
                <p className="gap-why">{gap.rationale || gap.requirement.text}</p>
                {!opened.has(gap.requirement.id) ? (
                  <button
                    type="button"
                    className="btn btn-quiet icon-label gap-open"
                    onClick={() => setOpened((o) => new Set(o).add(gap.requirement.id))}
                  >
                    <IconPlus />
                    {t('gaps.answerIt')}
                  </button>
                ) : (
                  <div className="gap-fields">
                    <label className="intake-field" htmlFor={`role-${gap.requirement.id}`}>
                      <span>{t('gaps.rolePick')}</span>
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
                    </label>
                    <label className="intake-field" htmlFor={`answer-${gap.requirement.id}`}>
                      <span>{t('gaps.prompt')}</span>
                      <AutoTextarea
                        id={`answer-${gap.requirement.id}`}
                        value={entries[gap.requirement.id]?.answer ?? ''}
                        onChange={(e) => set(gap.requirement.id, { answer: e.target.value })}
                        minRows={3}
                        placeholder={t('gaps.answerPlaceholder')}
                        className="field"
                      />
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="gap-actions">
            <button
              type="button"
              onClick={draft}
              disabled={busy || answered.length === 0}
              className="btn btn-primary"
            >
              {stage === 'drafting' ? t('gaps.building') : t('gaps.submit')}
            </button>
            <CostNote action="gaps" />
            {selection.secondary.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowSecondary((v) => !v)}
              >
                {showSecondary
                  ? t('gaps.otherHide')
                  : t('gaps.otherShow', { n: selection.secondary.length })}
              </button>
            )}
          </div>
        </>
      )}

      {(stage === 'review' || stage === 'saving') && (
        <>
          {dropped.length > 0 && (
            <div className="note">
              <p>{plural(t, dropped.length, 'gaps.dropped')}</p>
              {/* Shown, not merely counted. Seeing the exact figure that was
                  removed is what makes the guarantee checkable — and tells you
                  what to put back if it was true all along. */}
              <ul className="dropped-list">
                {dropped.map((d) => (
                  <li key={`${d.evidenceId}-${d.raw}`}>{d.raw}</li>
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
              <p className="note">{t('gaps.nothingNew')}</p>
              <div className="gap-actions">
                <button type="button" className="btn btn-quiet" onClick={() => setStage('writing')}>
                  {t('gaps.nothingNewBack')}
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="gap-review-title">{t('gaps.reviewTitle')}</h3>
              <ul className="gap-list">
                {evidence.map((item) => (
                  <li key={item.id} className="gap-item">
                    <span className="gap-source">
                      {roles.find((r) => r.id === item.sourceRef.id)?.company ?? item.sourceRef.id}
                    </span>
                    <p className="gap-text">{item.text}</p>
                  </li>
                ))}
              </ul>
              <div className="gap-actions">
                <button type="button" onClick={accept} disabled={busy} className="btn btn-primary">
                  {stage === 'saving' ? t('gaps.rescoring') : t('gaps.accept')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
