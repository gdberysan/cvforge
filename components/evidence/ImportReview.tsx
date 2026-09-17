'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { acceptImportAction } from '@/app/(app)/evidence/import/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { ApiFailure } from '@/lib/api-failure'
import { errorText, plural } from '@/lib/i18n'
import { formatSpan } from '@/lib/import/dates'
import { readAsBase64 } from '@/lib/read-file'
import type { ParsedCV } from '@/lib/schemas'
import { readEventStream } from '@/lib/sse-client'

const MAX_PDF_BYTES = 10 * 1024 * 1024

export function ImportReview({ hasProfile = false }: { hasProfile?: boolean }) {
  const t = useT()
  const router = useRouter()
  // PDF is the front door — that is what a CV actually is on disk. Pasting
  // text stays available behind a quiet toggle for the cases a PDF can't
  // cover (a CV that only exists in an email, a LinkedIn export).
  const [mode, setMode] = useState<'pdf' | 'text'>('pdf')
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedCV | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<'profile' | 'evidence' | null>(null)
  // Overwriting an existing profile is destructive, so it takes two clicks:
  // the first arms and says what will happen, the second does it (spec §10).
  const [armed, setArmed] = useState(false)
  const [isAccepting, startAccept] = useTransition()
  const reviewRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The "Read the CV" button unmounts when the skeleton arrives; without a
  // new home, keyboard focus falls to <body>.
  useEffect(() => {
    if (parsed) reviewRef.current?.focus({ preventScroll: true })
  }, [parsed])

  const canRun = mode === 'pdf' ? Boolean(file) : text.trim().length >= 50

  async function chooseFile(f: File) {
    setError(null)
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError(t('error.not-a-pdf'))
      return
    }
    if (f.size > MAX_PDF_BYTES) {
      setError(t('error.pdf-too-large'))
      return
    }
    try {
      setFile({ name: f.name, base64: await readAsBase64(f) })
    } catch {
      setError(t('error.not-a-pdf'))
    }
  }

  async function analyse() {
    setLoading(true)
    setError(null)
    setStage(null)
    try {
      const res = await fetch('/api/ai/parse-cv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode === 'pdf' && file ? { pdf: file.base64 } : { text }),
      })

      // Validation failures answer as plain JSON; a real parse streams its
      // two stages so the wait reads as progress instead of a hang.
      if (res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json()
        throw new ApiFailure(data.error, data.code)
      }

      await readEventStream(res.body, (event) => {
        if (event.done) {
          setParsed(event.parsed as ParsedCV)
          setProblems(event.problems as string[])
        } else if (typeof event.stage === 'string') {
          setStage(event.stage as 'profile' | 'evidence')
        }
      })
    } catch (e) {
      setError(
        e instanceof ApiFailure
          ? errorText(t, e.code, e.message)
          : e instanceof Error
            ? e.message
            : t('import.error'),
      )
    } finally {
      setLoading(false)
      setStage(null)
    }
  }

  const stageCopy =
    stage === 'profile'
      ? t('import.stage.profile')
      : stage === 'evidence'
        ? t('import.stage.evidence')
        : t('import.reading')

  function switchMode(next: 'pdf' | 'text') {
    setMode(next)
    setError(null)
  }

  if (!parsed) {
    return (
      <div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is inherently pointer-only; the file button and input inside are the accessible path to the same action */}
        <div
          className="console"
          // Drag-and-drop is an enhancement on the whole console; the button
          // and hidden input below are the accessible path.
          onDragOver={(e) => {
            if (mode !== 'pdf') return
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            if (mode !== 'pdf') return
            e.preventDefault()
            setDragOver(false)
            const dropped = e.dataTransfer.files?.[0]
            if (dropped) chooseFile(dropped)
          }}
          style={dragOver ? { borderColor: 'var(--amber-500)' } : undefined}
        >
          <p className="console-line">
            <span className="console-sigil">$</span>
            <span className="cmd-token">cvforge import --cv</span>
            {mode === 'pdf' && file && <span className="cmd-token">{file.name}</span>}
            {loading && <span className="cursor" aria-hidden />}
          </p>

          {mode === 'pdf' ? (
            <>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-4)',
                  minHeight: '16rem',
                  margin: 'var(--space-4) 0',
                  border: `1px dashed ${dragOver ? 'var(--amber-500)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {loading ? (
                  // The drop zone becomes the waiting screen: the two lines are
                  // the two real model calls, so this is progress, not theatre.
                  <p
                    className="fact"
                    style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}
                  >
                    <span style={{ color: stage === 'evidence' ? 'var(--accent)' : undefined }}>
                      {stageCopy}
                    </span>
                    <span className="cursor" aria-hidden />
                  </p>
                ) : (
                  <>
                    <p style={{ color: 'var(--text-muted)' }}>{t('import.drop')}</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      className="sr-only"
                      aria-label={t('import.fileAria')}
                      onChange={(e) => {
                        const picked = e.target.files?.[0]
                        if (picked) chooseFile(picked)
                        // Same file re-picked after an error should fire again.
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t('import.choose')}
                    </button>
                  </>
                )}
              </div>
              <p
                style={{
                  color: 'var(--text-muted)',
                  font: 'var(--type-body-sm)',
                  marginTop: 'var(--space-2)',
                }}
              >
                {t('import.linkedin')}
              </p>
            </>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // `!loading` mirrors the button: a second Cmd+Enter mid-parse
                // started an overlapping paid run whose stream corrupted the
                // one being reviewed.
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canRun && !loading) analyse()
              }}
              rows={16}
              // biome-ignore lint/a11y/noAutofocus: this mode exists to receive a paste
              autoFocus
              placeholder={t('import.placeholder')}
              aria-label={t('import.aria')}
              className="field-bare"
              // The console is the frame; a drag handle inside it breaks that.
              style={{ marginTop: 'var(--space-4)', font: 'var(--type-mono)', resize: 'none' }}
            />
          )}

          {/* Muted, not faint: live feedback must clear the contrast floor. */}
          <p className="console-line" aria-live="polite" style={{ color: 'var(--text-muted)' }}>
            <span aria-hidden>&gt;</span>
            <span>
              {loading && stageCopy}
              {!loading &&
                mode === 'pdf' &&
                (file ? t('import.readyPdf', { name: file.name }) : t('import.waitingPdf'))}
              {!loading && mode === 'text' && (canRun ? t('import.ready') : t('import.waiting'))}
            </span>
          </p>
        </div>

        {error && (
          // role="alert" so a failed parse is announced, not silently shown.
          <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-4)' }}>
            {error}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--space-4)',
            marginTop: 'var(--space-5)',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={analyse}
            disabled={loading || !canRun}
            className="btn btn-primary"
          >
            {loading ? t('import.running') : t('import.run')}
          </button>
          <button
            type="button"
            className="action-quiet"
            onClick={() => switchMode(mode === 'pdf' ? 'text' : 'pdf')}
          >
            {mode === 'pdf' ? t('import.pasteInstead') : t('import.pdfInstead')}
          </button>
        </div>
      </div>
    )
  }

  const quantified = parsed.evidence.filter((e) => e.metrics.length > 0).length

  const { education, certifications, languages, skills } = parsed.profile
  const credentials = [
    {
      label: t('import.education'),
      items: education.map((e) => ({
        key: e.id,
        primary: e.degree,
        secondary: [e.institution, formatSpan(e.period, t('evidence.present'), ' → ')]
          .filter(Boolean)
          .join(' · '),
      })),
    },
    {
      label: t('import.certifications'),
      items: certifications.map((c) => ({
        key: c.id,
        primary: c.name,
        // An empty issuer is a legitimate answer — a LinkedIn PDF export
        // prints certification names with none — so it is labelled rather
        // than left as a blank the reader has to interpret.
        secondary: [c.issuer || t('import.noIssuer'), c.date].filter(Boolean).join(' · '),
      })),
    },
    {
      label: t('import.languages'),
      items: languages.map((l) => ({
        key: l.language,
        primary: l.language,
        secondary: l.level,
      })),
    },
    {
      label: t('import.skills'),
      items: skills.map((group) => ({
        key: group.category,
        primary: group.category,
        secondary: group.items.join(', '),
      })),
    },
  ].filter((group) => group.items.length > 0)

  return (
    <div ref={reviewRef} tabIndex={-1} style={{ marginTop: 'var(--space-6)', outline: 'none' }}>
      {problems.length > 0 && (
        <div
          style={{
            border: '1px solid var(--signal-error)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <p className="fact-label" style={{ color: 'var(--signal-error)' }}>
            {plural(t, problems.length, 'import.problems')}
          </p>
          <ul
            style={{
              margin: 'var(--space-3) 0 0',
              paddingLeft: '1.1em',
              color: 'var(--text-body)',
              font: 'var(--type-body-sm)',
            }}
          >
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="eyebrow">{t('import.skeleton')}</p>
      <p className="fact" style={{ marginTop: 'var(--space-3)', color: 'var(--text-muted)' }}>
        {t('import.roles', { n: parsed.profile.experience.length })}
        {'  ·  '}
        {plural(t, parsed.evidence.length, 'evidence.records')}
        {'  ·  '}
        {t('evidence.quantified', { n: quantified })}
      </p>

      <p
        style={{
          color: 'var(--text-muted)',
          marginTop: 'var(--space-4)',
          maxWidth: '38em',
          lineHeight: 'var(--leading-relaxed)',
        }}
      >
        {t('import.lede2')}
      </p>

      {parsed.profile.experience.map((role) => {
        const roleEvidence = parsed.evidence.filter((e) => e.sourceRef.id === role.id)
        return (
          <section key={role.id} style={{ marginTop: 'var(--space-7)' }}>
            <hr className="rule" />
            <h2 style={{ font: 'var(--type-h4)', marginTop: 'var(--space-4)' }}>
              {role.title}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                {'\u00A0· '}
                {role.company}
              </span>
            </h2>
            <p className="fact" style={{ marginTop: 'var(--space-2)' }}>
              {role.period.start} → {role.period.end ?? t('evidence.present')}
            </p>

            <ul
              className="stack"
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 'var(--space-4) 0 0',
                gap: 'var(--space-2)',
              }}
            >
              {roleEvidence.map((e) => (
                <li
                  key={e.id}
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-3)',
                    font: 'var(--type-body-sm)',
                    color: 'var(--text-body)',
                  }}
                >
                  {e.text}
                  {e.metrics.length > 0 && (
                    <span className="datum" style={{ marginLeft: 'var(--space-2)' }}>
                      {e.metrics.map((m) => m.raw).join(' · ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {/* Everything the import saves that is not a role. Without this the
          screen promised "nothing is saved until you review it" while half
          the profile — degrees, certifications, languages, skills — was
          replaced sight unseen. */}
      {credentials.length > 0 && (
        <section style={{ marginTop: 'var(--space-7)' }}>
          <hr className="rule" />
          <p className="eyebrow" style={{ marginTop: 'var(--space-4)' }}>
            {t('import.credentials')}
          </p>
          <p
            style={{
              color: 'var(--text-muted)',
              marginTop: 'var(--space-3)',
              maxWidth: '38em',
              font: 'var(--type-body-sm)',
              lineHeight: 'var(--leading-relaxed)',
            }}
          >
            {t('import.credentials.lede')}
          </p>

          {credentials.map((group) => (
            <div key={group.label} style={{ marginTop: 'var(--space-5)' }}>
              <p className="fact-label">{group.label}</p>
              <ul
                className="stack"
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 'var(--space-2) 0 0',
                  gap: 'var(--space-1)',
                }}
              >
                {group.items.map((item) => (
                  <li
                    key={item.key}
                    style={{ font: 'var(--type-body-sm)', color: 'var(--text-body)' }}
                  >
                    {item.primary}
                    {item.secondary && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        {' · '}
                        {item.secondary}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-6)' }}>
          {error}
        </p>
      )}

      {armed && (
        <p
          style={{
            marginTop: 'var(--space-6)',
            maxWidth: '38em',
            borderLeft: '2px solid var(--signal-error)',
            paddingLeft: 'var(--space-3)',
            color: 'var(--text-body)',
            font: 'var(--type-body-sm)',
            lineHeight: 'var(--leading-relaxed)',
          }}
        >
          {t('import.replaceWarning')}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-8)' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={isAccepting}
          onClick={() => {
            if (hasProfile && !armed) {
              setArmed(true)
              return
            }
            startAccept(async () => {
              // A validation failure keeps this screen (and the paid parse)
              // alive with a message, instead of throwing it away.
              const result = await acceptImportAction(parsed)
              if (!result.ok) {
                setError(errorText(t, result.code, result.error))
                return
              }
              router.push('/evidence')
            })
          }}
        >
          {isAccepting
            ? t('import.saving')
            : armed
              ? t('import.replaceConfirm')
              : t('import.accept')}
        </button>
        {/* Named for what happens, not for how it feels: this throws away a
            parse you already paid for. */}
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            setArmed(false)
            setParsed(null)
            setFile(null)
          }}
        >
          {t('import.different')}
        </button>
      </div>
    </div>
  )
}
