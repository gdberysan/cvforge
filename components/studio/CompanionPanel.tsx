'use client'

import { useState, useTransition } from 'react'
import { saveScreeningAnswerAction } from '@/app/(app)/application/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { ApiFailure } from '@/lib/api-failure'
import { errorText } from '@/lib/i18n'
import type {
  CompanionKind,
  CoverLetter,
  GroundingReport,
  RecruiterMessage,
  ScreeningSet,
} from '@/lib/schemas'
import { GroundingFlags } from './GroundingFlags'

type AnyDocument = CoverLetter | ScreeningSet | RecruiterMessage

const PAGE: React.CSSProperties = {
  background: '#ffffff',
  color: '#14181d',
  borderRadius: 'var(--radius-md)',
  padding: '12mm',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '10.5pt',
  lineHeight: 1.5,
  boxShadow: 'var(--shadow-lg)',
}

function plaintextOf(kind: CompanionKind, document: AnyDocument): string {
  if (kind === 'coverLetter') {
    return (document as CoverLetter).paragraphs.map((p) => p.text).join('\n\n')
  }
  if (kind === 'screening') {
    return (document as ScreeningSet).answers.map((a) => `${a.question}\n${a.answer}`).join('\n\n')
  }
  return (document as RecruiterMessage).text
}

/**
 * One panel per companion. Same rhythm as the CV: generate, see the
 * grounding verdict, refine, copy. Screening answers are editable in place —
 * a refinement lands in the answer bank, so it is what the next posting
 * reuses.
 */
export function CompanionPanel({
  kind,
  applicationId,
  initialDocument,
  initialReport,
}: {
  kind: CompanionKind
  applicationId: string
  initialDocument: AnyDocument | null
  initialReport: GroundingReport | null
}) {
  const t = useT()
  const [document, setDocument] = useState(initialDocument)
  const [report, setReport] = useState(initialReport)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [recruiterName, setRecruiterName] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [, startSave] = useTransition()
  const [newQuestion, setNewQuestion] = useState('')
  // The answerId being (re)generated, or 'new' for a not-yet-saved custom question.
  const [answering, setAnswering] = useState<string | null>(null)

  async function generate() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/companion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          kind,
          ...(kind === 'recruiterMessage' && recruiterName.trim()
            ? { recruiterName: recruiterName.trim() }
            : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new ApiFailure(data.error, data.code)
      setDocument(data.document)
      setReport(data.report)
      setDrafts({})
    } catch (e) {
      setError(
        e instanceof ApiFailure
          ? errorText(t, e.code, e.message)
          : e instanceof Error
            ? e.message
            : t('studio.failed'),
      )
    } finally {
      setRunning(false)
    }
  }

  async function copy() {
    if (!document) return
    await navigator.clipboard.writeText(plaintextOf(kind, document))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /** Shared by "add a custom question" and "regenerate this answer" — both
   *  are just "answer this question", the only difference being whether an
   *  answerId is supplied. */
  async function answerQuestion(question: string, answerId?: string) {
    setAnswering(answerId ?? 'new')
    setError(null)
    try {
      const res = await fetch('/api/ai/companion/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId, question, answerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new ApiFailure(data.error, data.code)
      setDocument((prev) => {
        const current = (prev as ScreeningSet | null)?.answers ?? []
        const exists = current.some((a) => a.id === data.answer.id)
        return {
          answers: exists
            ? current.map((a) => (a.id === data.answer.id ? data.answer : a))
            : [...current, data.answer],
        }
      })
      setNewQuestion('')
    } catch (e) {
      setError(
        e instanceof ApiFailure
          ? errorText(t, e.code, e.message)
          : e instanceof Error
            ? e.message
            : t('studio.failed'),
      )
    } finally {
      setAnswering(null)
    }
  }

  function saveAnswer(answerId: string) {
    const value = drafts[answerId]
    if (value === undefined || !document) return
    startSave(async () => {
      const result = await saveScreeningAnswerAction({ applicationId, answerId, answer: value })
      if (!result.ok) {
        setError(errorText(t, result.code, result.error))
        return
      }
      setDocument({
        answers: (document as ScreeningSet).answers.map((a) =>
          a.id === answerId ? { ...a, answer: value } : a,
        ),
      })
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[answerId]
        return next
      })
      setSavedId(answerId)
      setTimeout(() => setSavedId(null), 2000)
    })
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {report && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <GroundingFlags report={report} />
        </div>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', marginBottom: 'var(--space-4)' }}>
          {error}
        </p>
      )}

      {kind === 'recruiterMessage' && (
        <div style={{ marginBottom: 'var(--space-4)', maxWidth: '24em' }}>
          <label htmlFor="recruiter-name" className="fact-label" style={{ display: 'block' }}>
            {t('companion.recruiterName')}
          </label>
          <input
            id="recruiter-name"
            value={recruiterName}
            onChange={(e) => setRecruiterName(e.target.value)}
            placeholder={t('companion.recruiterNamePlaceholder')}
            className="field"
            style={{ marginTop: 'var(--space-2)' }}
          />
        </div>
      )}

      {!document ? (
        <p aria-live="polite">
          {running ? (
            <span className="fact">
              {t('studio.generating')}
              <span className="cursor" aria-hidden style={{ marginLeft: 'var(--space-2)' }} />
            </span>
          ) : (
            <button type="button" onClick={generate} className="btn btn-primary">
              {t(`companion.generate.${kind}`)}
            </button>
          )}
        </p>
      ) : (
        <>
          <div
            aria-live="polite"
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              alignItems: 'baseline',
              flexWrap: 'wrap',
            }}
          >
            <button type="button" onClick={copy} className="btn btn-primary">
              {copied ? t('studio.copied') : t('companion.copy')}
            </button>
            <button type="button" onClick={generate} disabled={running} className="btn btn-quiet">
              {running ? t('studio.generating') : t('studio.regenerate')}
            </button>
            {running && <span className="cursor" aria-hidden />}
          </div>

          {kind === 'coverLetter' && (
            <article style={PAGE}>
              {(document as CoverLetter).paragraphs.map((p) => (
                <p key={p.id} style={{ margin: '0 0 4mm' }}>
                  {p.text}
                </p>
              ))}
            </article>
          )}

          {kind === 'recruiterMessage' && (
            <>
              <article style={PAGE}>
                <p style={{ margin: 0 }}>{(document as RecruiterMessage).text}</p>
              </article>
              <p
                className="fact"
                style={{
                  marginTop: 'var(--space-3)',
                  color:
                    (document as RecruiterMessage).text.length > 500
                      ? 'var(--signal-error)'
                      : 'var(--text-muted)',
                }}
              >
                {(document as RecruiterMessage).text.length}/500
              </p>
            </>
          )}

          {kind === 'screening' && (
            <>
              <p
                style={{
                  color: 'var(--text-muted)',
                  font: 'var(--type-body-sm)',
                  marginBottom: 'var(--space-4)',
                  maxWidth: '38em',
                }}
              >
                {t('companion.bankHint')}
              </p>
              <div className="stack" style={{ gap: 'var(--space-5)' }}>
                {(document as ScreeningSet).answers.map((a) => {
                  const draft = drafts[a.id]
                  const dirty = draft !== undefined && draft !== a.answer
                  return (
                    <div key={a.id} style={{ maxWidth: '38em' }}>
                      <p style={{ color: 'var(--text-strong)', font: 'var(--type-body-lg)' }}>
                        {a.question}
                      </p>
                      <AutoTextarea
                        value={draft ?? a.answer}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        minRows={2}
                        aria-label={a.question}
                        className="field"
                        style={{ marginTop: 'var(--space-2)' }}
                      />
                      <p
                        aria-live="polite"
                        style={{ marginTop: 'var(--space-2)', minHeight: '1.5em' }}
                      >
                        {dirty && (
                          <button type="button" className="action" onClick={() => saveAnswer(a.id)}>
                            {t('companion.saveAnswer')}
                          </button>
                        )}
                        {savedId === a.id && (
                          <span className="fact-label" style={{ color: 'var(--signal-ok)' }}>
                            {t('companion.saved')}
                          </span>
                        )}{' '}
                        <button
                          type="button"
                          className="action"
                          disabled={answering === a.id}
                          onClick={() => answerQuestion(a.question, a.id)}
                        >
                          {answering === a.id
                            ? t('studio.generating')
                            : t('companion.regenerateAnswer')}
                        </button>
                      </p>
                    </div>
                  )
                })}
              </div>

              <div style={{ marginTop: 'var(--space-6)', maxWidth: '38em' }}>
                <label htmlFor="new-question" className="fact-label" style={{ display: 'block' }}>
                  {t('companion.addQuestion')}
                </label>
                <AutoTextarea
                  id="new-question"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  minRows={1}
                  placeholder={t('companion.addQuestionPlaceholder')}
                  className="field"
                  style={{ marginTop: 'var(--space-2)' }}
                />
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={!newQuestion.trim() || answering === 'new'}
                  onClick={() => answerQuestion(newQuestion.trim())}
                  style={{ marginTop: 'var(--space-3)' }}
                >
                  {answering === 'new' ? t('studio.generating') : t('companion.answerQuestion')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
