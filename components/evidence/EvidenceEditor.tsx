'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { deleteEvidenceAction, upsertEvidenceAction } from '@/app/(app)/evidence/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { UndoBar } from '@/components/ui/UndoBar'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'
import { roleHealth } from '@/lib/strength'
import { EvidenceRecord } from './EvidenceRecord'
import { InterviewHistory, type InterviewSessionView } from './InterviewHistory'
import { RoleHeader } from './RoleHeader'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function EvidenceEditor({
  profile,
  evidence,
  interviewSessions = [],
}: {
  profile: MasterProfile
  evidence: EvidenceItem[]
  interviewSessions?: (InterviewSessionView & { roleId: string })[]
}) {
  const t = useT()
  const [items, setItems] = useState(evidence)
  // A server re-render (after deleting or adding a role) delivers a fresh
  // evidence array; the local list must adopt it or just-deleted records
  // linger as editable "orphans" that one keystroke re-upserts. The
  // adjust-state-during-render pattern, per React's own guidance.
  //
  // Only when the SET of records changed, though. Every debounced save also
  // revalidates this page, and adopting that echo replaced the local list
  // with the server's — dropping whatever was typed since the save fired
  // and any blank draft not yet written. Local drafts the server has never
  // seen survive a structural adoption too.
  const [prevEvidence, setPrevEvidence] = useState(evidence)
  if (evidence !== prevEvidence) {
    setPrevEvidence(evidence)
    const prevIds = new Set(prevEvidence.map((e) => e.id))
    const nextIds = new Set(evidence.map((e) => e.id))
    const structural =
      evidence.length !== prevEvidence.length || evidence.some((e) => !prevIds.has(e.id))
    if (structural) {
      setItems((local) => [
        ...evidence,
        ...local.filter((l) => !nextIds.has(l.id) && !prevIds.has(l.id)),
      ])
    }
  }
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [undoable, setUndoable] = useState<{
    item: EvidenceItem
    index: number
    sortOrder?: number | null
  } | null>(null)
  const [, startTransition] = useTransition()
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const t of map.values()) clearTimeout(t)
    }
  }, [])

  // "saved" is an event, not a state. Leaving it on screen turns a moment of
  // reassurance into permanent furniture; a failure stays until it is fixed.
  useEffect(() => {
    if (saveState !== 'saved') return
    const t = setTimeout(() => setSaveState('idle'), 1600)
    return () => clearTimeout(t)
  }, [saveState])

  // Ten seconds is long enough to notice the gap you just made and short
  // enough that the bar is never furniture.
  useEffect(() => {
    if (!undoable) return
    const t = setTimeout(() => setUndoable(null), 10_000)
    return () => clearTimeout(t)
  }, [undoable])

  // Appends a blank, unsaved record — nothing is written until the user
  // actually types into it via handleChange's own debounce. No AI round
  // trip: for a one-line role you already remember, the interview's
  // multi-question flow is more ceremony than the fact deserves.
  const addManual = useCallback((role: MasterProfile['experience'][number]) => {
    const draft: EvidenceItem = {
      id: `ev_${crypto.randomUUID().slice(0, 8)}`,
      kind: 'achievement',
      sourceRef: { type: 'experience', id: role.id },
      text: '',
      metrics: [],
      tags: [],
      period: role.period,
      strength: 'core',
      origin: 'manual',
    }
    setItems((prev) => [...prev, draft])
  }, [])

  const handleChange = useCallback((updated: EvidenceItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))

    const existing = timers.current.get(updated.id)
    if (existing) clearTimeout(existing)
    setSaveState('saving')
    timers.current.set(
      updated.id,
      setTimeout(() => {
        startTransition(async () => {
          const result = await upsertEvidenceAction(updated)
          setSaveState(result.ok ? 'saved' : 'error')
        })
      }, 800),
    )
  }, [])

  // Deleting is committed immediately; undo re-inserts the record where it was.
  // Keeping the row on screen pending confirmation would be worse — the list
  // would be lying about what is stored.
  const handleDelete = useCallback(
    (id: string) => {
      // A pending debounced save for this record would fire after the delete
      // and re-insert it via the upsert. The timer dies with the record.
      const pending = timers.current.get(id)
      if (pending) {
        clearTimeout(pending)
        timers.current.delete(id)
      }
      const index = items.findIndex((i) => i.id === id)
      if (index < 0) return
      const item = items[index]
      setUndoable({ item, index })
      setItems((prev) => prev.filter((i) => i.id !== id))
      startTransition(async () => {
        const result = await deleteEvidenceAction(id).catch(() => ({ ok: false as const }))
        if (result.ok) {
          setSaveState('saved')
          // Capture the stored position so undo restores it, not sortOrder 0.
          setUndoable((u) => (u && u.item.id === id ? { ...u, sortOrder: result.sortOrder } : u))
          return
        }
        // The record is still stored: put the row back where it was and drop
        // the undo bar, otherwise the list lies about what exists.
        setUndoable(null)
        setItems((prev) => {
          const next = [...prev]
          next.splice(Math.min(index, next.length), 0, item)
          return next
        })
        setSaveState('error')
      })
    },
    [items],
  )

  const handleUndo = useCallback(() => {
    if (!undoable) return
    const { item, index, sortOrder } = undoable
    setUndoable(null)
    setItems((prev) => {
      const next = [...prev]
      next.splice(Math.min(index, next.length), 0, item)
      return next
    })
    startTransition(async () => {
      const result = await upsertEvidenceAction(item, sortOrder ?? undefined).catch(() => ({
        ok: false as const,
      }))
      if (result.ok) {
        setSaveState('saved')
        return
      }
      // The re-insert never reached the store: take the row back out and say so.
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setSaveState('error')
    })
  }, [undoable])

  return (
    <div>
      <header>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
          <h1 style={{ font: 'var(--type-h2)', color: 'var(--text-strong)' }}>
            {profile.basics.fullName}
          </h1>
          <span
            className="fact-label"
            aria-live="polite"
            style={{ color: saveState === 'error' ? 'var(--signal-error)' : 'var(--text-muted)' }}
          >
            {saveState === 'idle' ? '' : t(`evidence.save.${saveState}`)}
          </span>
        </div>
        <p className="fact" style={{ marginTop: 'var(--space-2)', color: 'var(--text-muted)' }}>
          {t('import.roles', { n: profile.experience.length })}
          {'  ·  '}
          {t(`evidence.records.${items.length === 1 ? 'one' : 'other'}`, { n: items.length })}
          {'  ·  '}
          {t('evidence.quantified', { n: items.filter((i) => i.metrics.length > 0).length })}
        </p>
      </header>

      {profile.experience.map((role) => {
        const roleEvidence = items.filter(
          (i) => i.sourceRef.type === 'experience' && i.sourceRef.id === role.id,
        )
        // Empty and stub-only are the same situation to the reader — a role
        // that cannot yet carry a CV — so they get the same amber prompt and
        // the same live "expand" link. One shared reading (lib/strength)
        // keeps this prompt and the rail's dot from ever disagreeing.
        const { quantified, needsExpanding } = roleHealth(items, role.id)
        const onlyStubs = needsExpanding && roleEvidence.length > 0

        return (
          // The id anchors the rail's role index.
          <section key={role.id} id={`role-${role.id}`} style={{ marginTop: 'var(--space-8)' }}>
            <hr className="rule" />

            <RoleHeader
              role={role}
              recordCount={roleEvidence.length}
              quantified={quantified}
              needsExpanding={needsExpanding}
            />

            {needsExpanding && (
              <p
                style={{
                  marginTop: 'var(--space-3)',
                  color: 'var(--text-muted)',
                  font: 'var(--type-body-sm)',
                  borderLeft: '2px solid var(--accent)',
                  paddingLeft: 'var(--space-3)',
                  maxWidth: '38em',
                }}
              >
                {t(onlyStubs ? 'evidence.nudge.stub' : 'evidence.nudge.empty')}
              </p>
            )}

            {roleEvidence.length > 0 && (
              <div className="rec-grid" style={{ marginTop: 'var(--space-4)' }}>
                {roleEvidence.map((item) => (
                  <EvidenceRecord
                    key={item.id}
                    item={item}
                    onChange={handleChange}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              className="action"
              onClick={() => addManual(role)}
              style={{ marginTop: 'var(--space-3)' }}
            >
              {t('evidence.addManual')}
            </button>

            <InterviewHistory sessions={interviewSessions.filter((s) => s.roleId === role.id)} />
          </section>
        )
      })}

      {(() => {
        // A re-imported CV can drop a role; records recorded under it survive
        // and still feed the mapper. Hidden-but-active is the worst state —
        // show them so they can be kept, edited, or deleted.
        const orphans = items.filter(
          (i) =>
            i.sourceRef.type === 'experience' &&
            !profile.experience.some((r) => r.id === i.sourceRef.id),
        )
        if (orphans.length === 0) return null
        return (
          <section style={{ marginTop: 'var(--space-8)' }}>
            <hr className="rule" />
            <p className="eyebrow" style={{ marginTop: 'var(--space-4)' }}>
              {t('evidence.orphans.title')}
            </p>
            <p
              style={{
                marginTop: 'var(--space-3)',
                color: 'var(--text-muted)',
                font: 'var(--type-body-sm)',
                borderLeft: '2px solid var(--accent)',
                paddingLeft: 'var(--space-3)',
                maxWidth: '38em',
              }}
            >
              {t('evidence.orphans.lede')}
            </p>
            <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              {orphans.map((item) => (
                <EvidenceRecord
                  key={item.id}
                  item={item}
                  onChange={handleChange}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </section>
        )
      })()}

      {undoable && (
        <UndoBar
          label={t('undo.deleted', { id: undoable.item.id })}
          onUndo={handleUndo}
          onDismiss={() => setUndoable(null)}
        />
      )}
    </div>
  )
}
