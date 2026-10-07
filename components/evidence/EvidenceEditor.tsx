'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { deleteEvidenceAction, upsertEvidenceAction } from '@/app/(app)/evidence/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { UndoBar } from '@/components/ui/UndoBar'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'
import { roleHealth } from '@/lib/strength'
import { EvidenceRecord } from './EvidenceRecord'
import { InterviewHistory, type InterviewSessionView } from './InterviewHistory'
import { AddProject, ProjectHeader } from './ProjectCard'
import { RoleHeader } from './RoleHeader'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * The page as a work queue: each filter is one kind of unfinished record.
 * "Solo líneas del CV" is the import's own wording, still waiting for the
 * interview that turns it into evidence.
 */
type Filter = 'all' | 'unquantified' | 'stubs' | 'untagged'
const FILTERS: Record<Filter, (item: EvidenceItem) => boolean> = {
  all: () => true,
  unquantified: (i) => i.kind === 'achievement' && i.metrics.length === 0,
  stubs: (i) => i.origin === 'import',
  untagged: (i) => i.tags.length === 0,
}
const FILTER_ORDER: Filter[] = ['all', 'unquantified', 'stubs', 'untagged']

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
  const [filter, setFilter] = useState<Filter>('all')
  // Roles that need work start open; finished ones start as one summary
  // line, so a long career reads as a list of what is left to do.
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        profile.experience
          .filter(
            (r) =>
              roleHealth(evidence, r.id).needsExpanding ||
              evidence.some(
                (e) =>
                  e.sourceRef.type === 'experience' &&
                  e.sourceRef.id === r.id &&
                  FILTERS.unquantified(e),
              ),
          )
          .map((r) => r.id),
      ),
  )
  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // The rail's role links are #role-… anchors: following one opens the role.
  useEffect(() => {
    const openFromHash = () => {
      const id = window.location.hash.match(/^#role-(.+)$/)?.[1]
      if (id) setOpen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [])
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
  // The record takes its source's period — a role's, or a dated project's.
  const addManual = useCallback(
    (sourceRef: EvidenceItem['sourceRef'], period: EvidenceItem['period']) => {
      const draft: EvidenceItem = {
        id: `ev_${crypto.randomUUID().slice(0, 8)}`,
        kind: 'achievement',
        sourceRef,
        text: '',
        metrics: [],
        tags: [],
        period,
        strength: 'core',
        origin: 'manual',
      }
      setItems((prev) => [...prev, draft])
      // A blank record matches no filter but "all", and must not land in a
      // collapsed role: show the role it was added to.
      setFilter('all')
      setOpen((prev) => new Set(prev).add(sourceRef.id))
    },
    [],
  )

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
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons, as in LocaleSwitch; a fieldset is for form inputs and would need its chrome reset */}
        <div role="group" aria-label={t('evidence.filter.aria')} className="queue-filters">
          {FILTER_ORDER.map((f) => {
            const count = items.filter(FILTERS[f]).length
            if (f !== 'all' && count === 0) return null
            return (
              <button
                key={f}
                type="button"
                className="chip-toggle"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {t(`evidence.filter.${f}`)}
                <span className="chip-count">{count}</span>
              </button>
            )
          })}
        </div>
      </header>

      {profile.experience.map((role) => {
        const roleEvidence = items.filter(
          (i) => i.sourceRef.type === 'experience' && i.sourceRef.id === role.id,
        )
        const shown = roleEvidence.filter(FILTERS[filter])
        // A filter hides the roles with nothing to show for it.
        if (filter !== 'all' && shown.length === 0) return null
        // Empty and stub-only are the same situation to the reader — a role
        // that cannot yet carry a CV — so they get the same amber prompt and
        // the same live "expand" link. One shared reading (lib/strength)
        // keeps this prompt and the rail's dot from ever disagreeing.
        const { quantified, needsExpanding } = roleHealth(items, role.id)
        const onlyStubs = needsExpanding && roleEvidence.length > 0
        // Filtering is looking for something: every matching role is open.
        const isOpen = filter !== 'all' || open.has(role.id)
        const bodyId = `role-body-${role.id}`

        return (
          // The id anchors the rail's role index.
          <section key={role.id} id={`role-${role.id}`} style={{ marginTop: 'var(--space-8)' }}>
            <hr className="rule" />

            <div className="role-row">
              <button
                type="button"
                className="role-toggle"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                aria-label={t(isOpen ? 'evidence.collapse' : 'evidence.expandRole', {
                  company: role.company,
                })}
                onClick={() => toggle(role.id)}
                disabled={filter !== 'all'}
              >
                <span aria-hidden>›</span>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <RoleHeader
                  role={role}
                  recordCount={roleEvidence.length}
                  quantified={quantified}
                  needsExpanding={needsExpanding}
                />
              </div>
            </div>

            <div id={bodyId} hidden={!isOpen}>
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

              {shown.length > 0 && (
                <div className="rec-grid" style={{ marginTop: 'var(--space-4)' }}>
                  {shown.map((item) => (
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
                onClick={() => addManual({ type: 'experience', id: role.id }, role.period)}
                style={{ marginTop: 'var(--space-3)' }}
              >
                {t('evidence.addManual')}
              </button>

              <InterviewHistory sessions={interviewSessions.filter((s) => s.roleId === role.id)} />
            </div>
          </section>
        )
      })}

      <section id="projects" style={{ marginTop: 'var(--space-10)' }}>
        <hr className="rule" />
        <p className="eyebrow" style={{ marginTop: 'var(--space-4)' }}>
          {t('evidence.projects.eyebrow')}
        </p>
        <p
          style={{
            marginTop: 'var(--space-3)',
            color: 'var(--text-muted)',
            font: 'var(--type-body-sm)',
            maxWidth: '38em',
          }}
        >
          {t('evidence.projects.lede')}
        </p>

        {profile.projects.map((project) => {
          const allProjectEvidence = items.filter(
            (i) => i.sourceRef.type === 'project' && i.sourceRef.id === project.id,
          )
          const projectEvidence = allProjectEvidence.filter(FILTERS[filter])
          if (filter !== 'all' && projectEvidence.length === 0) return null
          const start = project.period?.start
          return (
            <section
              key={project.id}
              id={`project-${project.id}`}
              style={{ marginTop: 'var(--space-6)' }}
            >
              <ProjectHeader
                project={project}
                recordCount={allProjectEvidence.length}
                quantified={allProjectEvidence.filter((i) => i.metrics.length > 0).length}
              />

              {projectEvidence.length > 0 && (
                <div className="rec-grid" style={{ marginTop: 'var(--space-4)' }}>
                  {projectEvidence.map((item) => (
                    <EvidenceRecord
                      key={item.id}
                      item={item}
                      onChange={handleChange}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}

              {start ? (
                <button
                  type="button"
                  className="action"
                  onClick={() =>
                    addManual(
                      { type: 'project', id: project.id },
                      { start, ...(project.period?.end ? { end: project.period.end } : {}) },
                    )
                  }
                  style={{ marginTop: 'var(--space-3)' }}
                >
                  {t('evidence.addManual')}
                </button>
              ) : (
                // A record needs a period, and inventing one is the one thing
                // this app does not do — so the dates come first.
                <p
                  style={{
                    marginTop: 'var(--space-3)',
                    color: 'var(--text-muted)',
                    font: 'var(--type-body-sm)',
                  }}
                >
                  {t('evidence.project.undated')}
                </p>
              )}
            </section>
          )
        })}

        <AddProject />
      </section>

      {(() => {
        // A re-imported CV can drop a role; records recorded under it survive
        // and still feed the mapper. Hidden-but-active is the worst state —
        // show them so they can be kept, edited, or deleted.
        const orphans = items.filter(
          (i) =>
            (i.sourceRef.type === 'experience' &&
              !profile.experience.some((r) => r.id === i.sourceRef.id)) ||
            (i.sourceRef.type === 'project' &&
              !profile.projects.some((p) => p.id === i.sourceRef.id)),
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
          label={t('undo.deleted')}
          onUndo={handleUndo}
          onDismiss={() => setUndoable(null)}
        />
      )}
    </div>
  )
}
