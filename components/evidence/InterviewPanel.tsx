'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { acceptInterviewAction } from '@/app/(app)/evidence/interview/actions'
import { useLocale, useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { ApiFailure } from '@/lib/api-failure'
import { errorText, plural } from '@/lib/i18n'
import { clearDraft, loadDraft, saveDraft } from '@/lib/interview/draft'
import type { EvidenceItem, Experience, InterviewQuestion } from '@/lib/schemas'

type Stage = 'idle' | 'planning' | 'answering' | 'structuring' | 'review'

export function InterviewPanel({
  role,
  stubs,
  existingCount,
}: {
  role: Experience
  stubs: EvidenceItem[]
  /** Interviewed/manual records already on file for this role. */
  existingCount: number
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [questions, setQuestions] = useState<InterviewQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [dropped, setDropped] = useState<{ evidenceId: string; raw: string }[]>([])
  // The exact Q&A sent to /structure, held onto so accept() can save it as
  // this role's interview session — verbatim, not the condensed evidence.
  const [transcript, setTranscript] = useState<{ question: string; answer: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  // Answers are the most expensive text typed anywhere in the product — the
  // detail the CV lost exists nowhere else. The draft survives a refresh, a
  // stray nav click, or a crash, and is cleared only on accept.
  useEffect(() => {
    const draft = loadDraft(window.localStorage, role.id, {
      locale,
      company: role.company,
      title: role.title,
    })
    if (draft && draft.questions.length > 0) {
      setQuestions(draft.questions)
      setAnswers(draft.answers)
      setStage('answering')
    }
  }, [role.id, locale, role.company, role.title])

  useEffect(() => {
    if (stage === 'idle' || stage === 'planning' || questions.length === 0) return
    saveDraft(
      window.localStorage,
      role.id,
      { locale, company: role.company, title: role.title },
      { questions, answers },
    )
  }, [stage, questions, answers, role.id, locale, role.company, role.title])

  async function post(body: unknown) {
    const res = await fetch('/api/ai/interview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new ApiFailure(data.error, data.code)
    return data
  }

  function failureMessage(
    e: unknown,
    fallbackKey: 'interview.error.plan' | 'interview.error.structure',
  ) {
    if (e instanceof ApiFailure) return errorText(t, e.code, e.message)
    return e instanceof Error ? e.message : t(fallbackKey)
  }

  async function start() {
    setStage('planning')
    setError(null)
    try {
      const data = await post({ action: 'plan', roleId: role.id })
      setQuestions(data.questions)
      setStage('answering')
    } catch (e) {
      setError(failureMessage(e, 'interview.error.plan'))
      setStage('idle')
    }
  }

  async function submit() {
    setStage('structuring')
    setError(null)
    try {
      const answered = questions
        .filter((q) => (answers[q.id] ?? '').trim().length > 0)
        .map((q) => ({ questionId: q.id, question: q.question, answer: answers[q.id] }))
      const data = await post({ action: 'structure', roleId: role.id, answers: answered })
      setEvidence(data.evidence)
      setDropped(data.dropped)
      setTranscript(answered.map((a) => ({ question: a.question, answer: a.answer })))
      setStage('review')
    } catch (e) {
      setError(failureMessage(e, 'interview.error.structure'))
      setStage('answering')
    }
  }

  const answered = questions.filter((q) => (answers[q.id] ?? '').trim().length > 0).length
  const busy = stage === 'planning' || stage === 'structuring'

  const status =
    stage === 'planning'
      ? t('interview.status.planning')
      : stage === 'structuring'
        ? t('interview.status.structuring')
        : stage === 'answering'
          ? t('interview.status.answering', { answered, total: questions.length })
          : stage === 'review'
            ? plural(t, evidence.length, 'interview.status.built')
            : plural(t, stubs.length, 'interview.status.onFile')

  return (
    <div>
      {/* One console across every stage, so the interview reads as a single
          session rather than four screens that happen to share a header. */}
      <div className="console">
        <p className="console-line">
          <span className="console-sigil">$</span>
          <span className="cmd-token">cvforge interview --role {role.id}</span>
          {busy && <span className="cursor" aria-hidden />}
        </p>
        {/* Muted, not faint: live feedback has to clear the contrast floor. */}
        <p
          className="console-line"
          aria-live="polite"
          style={{ color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}
        >
          <span aria-hidden>&gt;</span>
          <span>{status}</span>
        </p>
      </div>

      {error && (
        // role="alert" so a failed run is announced, not silently rendered.
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-4)' }}>
          {error}
        </p>
      )}

      {(stage === 'idle' || stage === 'planning') && (
        <>
          {stubs.length === 0 && existingCount === 0 && (
            // Landing here straight from "add a role" is disorienting
            // otherwise: nothing says the role persisted or that leaving
            // loses nothing.
            <p
              style={{
                color: 'var(--text-body)',
                marginTop: 'var(--space-5)',
                maxWidth: '36em',
                lineHeight: 'var(--leading-relaxed)',
                borderLeft: '2px solid var(--accent)',
                paddingLeft: 'var(--space-3)',
              }}
            >
              {t('interview.freshRole')}
            </p>
          )}
          <p
            style={{
              color: 'var(--text-muted)',
              marginTop: 'var(--space-5)',
              maxWidth: '36em',
              lineHeight: 'var(--leading-relaxed)',
            }}
          >
            {t('interview.lede')}
          </p>

          <button
            type="button"
            onClick={start}
            disabled={stage === 'planning'}
            className="btn btn-primary"
            style={{ marginTop: 'var(--space-5)' }}
          >
            {stage === 'planning' ? t('interview.preparing') : t('interview.start')}
          </button>
        </>
      )}

      {(stage === 'answering' || stage === 'structuring') && (
        <>
          <ol
            className="stack"
            style={{
              listStyle: 'none',
              padding: 0,
              gap: 'var(--space-7)',
              marginTop: 'var(--space-6)',
            }}
          >
            {questions.map((q, i) => (
              // One measure for the whole question: an answer box wider than the
              // question it answers gives the column two different right edges.
              <li key={q.id} style={{ maxWidth: '34em' }}>
                <p className="fact-label">
                  {String(i + 1).padStart(2, '0')} · {t(`probe.${q.probesFor}`)}
                </p>
                <label
                  htmlFor={q.id}
                  style={{
                    display: 'block',
                    font: 'var(--type-body-lg)',
                    color: 'var(--text-strong)',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  {q.question}
                </label>
                {/* The model wrote this, so it keeps its own sentence case —
                    the uppercase label class is for words we write. */}
                <p
                  style={{
                    color: 'var(--text-muted)',
                    font: 'var(--type-body-sm)',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  {q.why}
                </p>
                <AutoTextarea
                  id={q.id}
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    // `!busy` mirrors the button: a second Cmd+Enter mid-run
                    // fired a second paid structuring call.
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && answered > 0 && !busy)
                      submit()
                  }}
                  minRows={2}
                  placeholder={t('interview.answerPlaceholder')}
                  className="field"
                  style={{ marginTop: 'var(--space-3)' }}
                />
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={submit}
            disabled={stage === 'structuring' || answered === 0}
            className="btn btn-primary"
            style={{ marginTop: 'var(--space-7)' }}
          >
            {stage === 'structuring' ? t('interview.building') : t('interview.submit')}
          </button>
        </>
      )}

      {stage === 'review' && (
        <>
          {dropped.length > 0 && (
            <div style={{ marginTop: 'var(--space-5)', maxWidth: '38em' }}>
              <p style={{ color: 'var(--text-muted)', lineHeight: 'var(--leading-relaxed)' }}>
                {plural(t, dropped.length, 'interview.dropped')}
              </p>

              {/* Shown, not just counted. A guarantee you cannot inspect is a
                  claim; seeing the exact words that were removed is what makes
                  it checkable — and tells you what to add back if it was true. */}
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

          <ul
            className="stack"
            style={{
              listStyle: 'none',
              padding: 0,
              gap: 'var(--space-3)',
              marginTop: 'var(--space-5)',
            }}
          >
            {evidence.map((item) => (
              <li
                key={item.id}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderLeft: `2px solid ${item.strength === 'core' ? 'var(--accent)' : 'var(--graphite-500)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                }}
              >
                <span className="ident">{item.id}</span>
                <p style={{ color: 'var(--text-body)', marginTop: 'var(--space-2)' }}>
                  {item.text}
                </p>
                {item.metrics.length > 0 && (
                  <p className="datum" style={{ marginTop: 'var(--space-3)' }}>
                    {item.metrics.map((m) => m.raw).join('  ·  ')}
                  </p>
                )}
                {item.tags.length > 0 && (
                  <p
                    className="fact"
                    style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}
                  >
                    {item.tags.join('  ')}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-7)' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSaving}
              onClick={() =>
                startSave(async () => {
                  const result = await acceptInterviewAction({
                    roleId: role.id,
                    replaceStubIds: stubs.map((s) => s.id),
                    evidence,
                    answers: transcript,
                  })
                  // A failure keeps the review (and the paid structuring)
                  // alive with a message instead of eating the screen.
                  if (!result.ok) {
                    setError(errorText(t, result.code, result.error))
                    return
                  }
                  clearDraft(window.localStorage, role.id)
                  router.push('/evidence')
                })
              }
            >
              {/* A role with nothing on file replaces nothing. "Replace 0 stubs"
                  described an action that was not happening. */}
              {isSaving
                ? t('interview.saving')
                : stubs.length === 0
                  ? plural(t, evidence.length, 'interview.save')
                  : plural(t, stubs.length, 'interview.replace')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setStage('answering')}>
              {t('interview.back')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
