'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { deleteEvidenceAction, upsertEvidenceAction } from '@/app/(app)/evidence/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconChevron, IconEdit, IconPlus } from '@/components/ui/icons'
import { UndoBar } from '@/components/ui/UndoBar'
import { PHONE, useMedia } from '@/components/ui/use-media'
import type { EvidenceItem, MasterProfile } from '@/lib/schemas'
import { roleHealth } from '@/lib/strength'
import { AddRole } from './AddRole'
import { DetailsCard } from './DetailsCard'
import { EvidenceRecord } from './EvidenceRecord'
import { InterviewHistory, type InterviewSessionView } from './InterviewHistory'
import { AddProject, ProjectHeader } from './ProjectCard'
import { RecordView } from './RecordView'
import { RoleForm, RoleHeader } from './RoleHeader'
import { EVIDENCE_FILTER_EVENT } from './ShowEvidenceButton'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * What the strength card's button narrows the page to: the records its one
 * fix is waiting on. No tab bar — a filter is reached from the fix that
 * needs it, and a banner says it is on and takes you back.
 */
type Filter = 'all' | 'unquantified' | 'untagged'
const FILTERS: Record<Filter, (item: EvidenceItem) => boolean> = {
  all: () => true,
  unquantified: (i) => i.kind === 'achievement' && i.metrics.length === 0,
  untagged: (i) => i.tags.length === 0,
}

/** An empty number field is a field still being typed, not a metric: never sent. */
const sendable = (item: EvidenceItem): EvidenceItem => ({
  ...item,
  metrics: item.metrics.filter((m) => m.raw.trim() !== ''),
})

const without = (s: Set<string>, id: string) => {
  const next = new Set(s)
  next.delete(id)
  return next
}

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
  const phone = useMedia(PHONE)
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
  // The strength card's button: show the entries it is waiting on.
  useEffect(() => {
    const on = (e: Event) => {
      const f = (e as CustomEvent<string>).detail as Filter
      if (!(f in FILTERS)) return
      setFilter(f)
      document.getElementById('exp-roles')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }
    window.addEventListener(EVIDENCE_FILTER_EVENT, on)
    return () => window.removeEventListener(EVIDENCE_FILTER_EVENT, on)
  }, [])
  // Records read first and open on a tap (spec 2026-10-15 phase 3): which
  // ones the person opened, and which hold an edit not yet confirmed saved —
  // those stay open until the save settles, so nothing typed is hidden.
  const [editing, setEditing] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  // The jobs are the page's index: each one line until opened. The newest
  // starts open so the page shows what an entry looks like, and so does any
  // job with nothing usable yet — its one move is inside. A missing number
  // does not open a job: its line says so, and the strength card's button
  // gathers every one of them.
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        profile.experience
          .filter((r, i) => i === 0 || roleHealth(evidence, r.id).needsExpanding)
          .map((r) => r.id),
      ),
  )
  // The job whose title, company and dates are being edited.
  const [editingRole, setEditingRole] = useState<string | null>(null)
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
  // The edit each timer is waiting to send, so it can be sent early.
  const pending = useRef(new Map<string, EvidenceItem>())
  // The save each record is waiting on. An edit leaves `pending` the moment
  // its save starts, so without this a second tap during that save found
  // nothing waiting and opened the next record before the answer came back.
  const inFlight = useRef(new Map<string, Promise<boolean>>())

  // Leaving the page inside the 800 ms after a keystroke used to drop that
  // keystroke with the timer. What is still waiting is sent on the way out.
  useEffect(() => {
    const map = timers.current
    const waiting = pending.current
    return () => {
      for (const t of map.values()) clearTimeout(t)
      for (const item of waiting.values()) void upsertEvidenceAction(sendable(item)).catch(() => {})
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
      // Open by choice, not only because it is blank: once its first save
      // lands it must not fold back into the read view mid-sentence.
      setEditing((prev) => (phone ? new Set([draft.id]) : new Set(prev).add(draft.id)))
      // A blank record matches no filter but "all", and must not land in a
      // collapsed role: show the role it was added to.
      setFilter('all')
      setOpen((prev) => new Set(prev).add(sourceRef.id))
    },
    [phone],
  )

  const save = useCallback((item: EvidenceItem) => {
    const run = (async () => {
      const result = await upsertEvidenceAction(sendable(item)).catch(() => ({
        ok: false as const,
      }))
      setSaveState(result.ok ? 'saved' : 'error')
      if (result.ok) {
        setDirty((d) => without(d, item.id))
        return true
      }
      // Kept for the next flush ("Done", switching records), unless a newer
      // edit has replaced it since: a failed save is retried, never dropped.
      if (!pending.current.has(item.id)) pending.current.set(item.id, item)
      setDirty((d) => (d.has(item.id) ? d : new Set(d).add(item.id)))
      return false
    })()
    inFlight.current.set(item.id, run)
    void run.finally(() => {
      if (inFlight.current.get(item.id) === run) inFlight.current.delete(item.id)
    })
    return run
  }, [])

  /** Sends a record's waiting edit now instead of in 800 ms. True when nothing is left unsaved. */
  const flush = useCallback(
    async (id: string) => {
      const item = pending.current.get(id)
      if (!item) return inFlight.current.get(id) ?? true
      const timer = timers.current.get(id)
      if (timer) clearTimeout(timer)
      timers.current.delete(id)
      pending.current.delete(id)
      return save(item)
    },
    [save],
  )

  const handleChange = useCallback(
    (updated: EvidenceItem) => {
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
      setDirty((d) => (d.has(updated.id) ? d : new Set(d).add(updated.id)))
      pending.current.set(updated.id, updated)

      const existing = timers.current.get(updated.id)
      if (existing) clearTimeout(existing)
      setSaveState('saving')
      timers.current.set(
        updated.id,
        setTimeout(() => {
          timers.current.delete(updated.id)
          pending.current.delete(updated.id)
          startTransition(async () => {
            await save(updated)
          })
        }, 800),
      )
    },
    [save],
  )

  /**
   * Opens a record's editor. On a phone one record is open at a time, and
   * the one being closed has its waiting edit sent first: if that save
   * fails, it stays open with the error and the new one does not open.
   * True when the record opened.
   */
  const openRecord = useCallback(
    async (id: string): Promise<boolean> => {
      if (!phone) {
        setEditing((s) => new Set(s).add(id))
        return true
      }
      for (const other of new Set([...editing, ...dirty])) {
        if (other !== id && !(await flush(other))) return false
      }
      setEditing(new Set([id]))
      return true
    },
    [phone, editing, dirty, flush],
  )

  const closeRecord = useCallback(
    async (id: string) => {
      await flush(id)
      setEditing((s) => without(s, id))
    },
    [flush],
  )

  // The editor's own "add a number": an empty metric that takes the focus.
  const addNumber = useCallback(
    async (item: EvidenceItem) => {
      if (!(await openRecord(item.id))) return
      handleChange({ ...item, metrics: [...item.metrics, { raw: '' }] })
    },
    [openRecord, handleChange],
  )

  // Deleting is committed immediately; undo re-inserts the record where it was.
  // Keeping the row on screen pending confirmation would be worse — the list
  // would be lying about what is stored.
  const handleDelete = useCallback(
    (id: string) => {
      // A pending debounced save for this record would fire after the delete
      // and re-insert it via the upsert. The timer dies with the record.
      const timer = timers.current.get(id)
      if (timer) {
        clearTimeout(timer)
        timers.current.delete(id)
      }
      pending.current.delete(id)
      setDirty((d) => without(d, id))
      setEditing((s) => without(s, id))
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

  // A record being edited stays on screen whatever the filter: adding its
  // number must not make it vanish from the "no number" list mid-edit.
  const inView = (f: Filter) => (i: EvidenceItem) =>
    FILTERS[f](i) || editing.has(i.id) || dirty.has(i.id)

  // "Add the numbers" is a work session, the same on a phone and a desktop:
  // every result without one opens to its number field alone, the first
  // with the cursor in it. An entry opened on purpose gets the full editor.
  const numberOnly = (item: EvidenceItem) =>
    filter === 'unquantified' && !editing.has(item.id) && item.text.trim() !== ''
  const firstToFill =
    filter === 'unquantified'
      ? [
          ...profile.experience.map((r) => ['experience', r.id] as const),
          ...profile.projects.map((p) => ['project', p.id] as const),
        ]
          .flatMap(([type, id]) =>
            items.filter(
              (i) => i.sourceRef.type === type && i.sourceRef.id === id && FILTERS.unquantified(i),
            ),
          )
          .find(numberOnly)?.id
      : undefined
  const isOpen = (item: EvidenceItem) =>
    editing.has(item.id) ||
    dirty.has(item.id) ||
    item.text.trim() === '' ||
    filter === 'unquantified'

  const record = (item: EvidenceItem) =>
    isOpen(item) ? (
      <EvidenceRecord
        key={item.id}
        item={item}
        onChange={handleChange}
        onDelete={handleDelete}
        onDone={item.text.trim() === '' ? undefined : () => closeRecord(item.id)}
        numberOnly={numberOnly(item)}
        focusNumber={item.id === firstToFill}
      />
    ) : (
      <RecordView
        key={item.id}
        item={item}
        onOpen={() => openRecord(item.id)}
        onAddNumber={() => addNumber(item)}
      />
    )

  return (
    <div className="exp-work">
      <DetailsCard profile={profile} />

      <div className="exp-section-head" id="exp-roles">
        <h2>{t('evidence.roles.title')}</h2>
        <span
          className={saveState === 'error' ? 'fact-label is-error' : 'fact-label is-muted'}
          aria-live="polite"
        >
          {saveState === 'idle' ? '' : t(`evidence.save.${saveState}`)}
        </span>
      </div>
      {filter !== 'all' && (
        <p className="exp-filter">
          <span>{t(`evidence.showing.${filter}`)}</span>
          <button type="button" className="action" onClick={() => setFilter('all')}>
            {t('evidence.showAll')}
          </button>
        </p>
      )}

      {profile.experience.map((role) => {
        const roleEvidence = items.filter(
          (i) => i.sourceRef.type === 'experience' && i.sourceRef.id === role.id,
        )
        const shown = roleEvidence.filter(inView(filter))
        // A filter hides the roles with nothing to show for it.
        if (filter !== 'all' && shown.length === 0) return null
        // Empty and stub-only are the same situation to the reader — a role
        // that cannot yet carry a CV — so they get the same amber prompt and
        // the same live "expand" link. One shared reading (lib/strength)
        // keeps this prompt and the rail's dot from ever disagreeing.
        const { needsExpanding } = roleHealth(items, role.id)
        const onlyStubs = needsExpanding && roleEvidence.length > 0
        // Filtering is looking for something: every matching role is open.
        const roleOpen = filter !== 'all' || open.has(role.id)
        const bodyId = `role-body-${role.id}`

        return (
          <section
            key={role.id}
            id={`role-${role.id}`}
            className={`role-section${roleOpen ? ' is-open' : ''}`}
          >
            {editingRole === role.id ? (
              <RoleForm
                role={role}
                recordCount={roleEvidence.length}
                onDone={() => setEditingRole(null)}
              />
            ) : (
              <RoleHeader
                role={role}
                recordCount={roleEvidence.length}
                missingNumbers={roleEvidence.filter(FILTERS.unquantified).length}
                open={roleOpen}
                bodyId={bodyId}
                onToggle={filter === 'all' ? () => toggle(role.id) : undefined}
              />
            )}

            <div id={bodyId} className="role-body" hidden={!roleOpen}>
              {needsExpanding && (
                <p className="evidence-nudge">
                  {t(onlyStubs ? 'evidence.nudge.stub' : 'evidence.nudge.empty')}
                </p>
              )}

              {shown.length > 0 && <div className="rec-grid">{shown.map(record)}</div>}

              {/* What you can do with the job, once, at its foot: add a line,
                  fix its facts, or let CVForge ask what the CV left out. */}
              <div className="role-foot">
                <button
                  type="button"
                  className="action icon-label"
                  onClick={() => addManual({ type: 'experience', id: role.id }, role.period)}
                >
                  <IconPlus />
                  {t('evidence.addManual')}
                </button>
                {editingRole !== role.id && (
                  <button
                    type="button"
                    className="action icon-label"
                    onClick={() => setEditingRole(role.id)}
                  >
                    <IconEdit />
                    {t('role.editRole')}
                  </button>
                )}
                <Link
                  href={`/evidence/interview/${role.id}`}
                  className={`btn ${needsExpanding ? 'btn-primary' : 'btn-quiet'} icon-label role-more`}
                >
                  {t('evidence.expandBtn')}
                  <IconChevron />
                </Link>
              </div>

              <InterviewHistory sessions={interviewSessions.filter((s) => s.roleId === role.id)} />
            </div>
          </section>
        )
      })}

      {/* Adding a role belongs with the roles, before the projects. */}
      <AddRole />

      <section id="projects" className="projects-section board">
        <header className="board-head">
          <h2>{t('evidence.projects.eyebrow')}</h2>
          <p>{t('evidence.projects.lede')}</p>
        </header>

        {profile.projects.map((project) => {
          const allProjectEvidence = items.filter(
            (i) => i.sourceRef.type === 'project' && i.sourceRef.id === project.id,
          )
          const projectEvidence = allProjectEvidence.filter(inView(filter))
          if (filter !== 'all' && projectEvidence.length === 0) return null
          const start = project.period?.start
          return (
            <section key={project.id} id={`project-${project.id}`} className="project-section">
              <ProjectHeader
                project={project}
                recordCount={allProjectEvidence.length}
                quantified={allProjectEvidence.filter((i) => i.metrics.length > 0).length}
              />

              {projectEvidence.length > 0 && (
                <div className="rec-grid">{projectEvidence.map(record)}</div>
              )}

              {start ? (
                <button
                  type="button"
                  className="action icon-label role-add"
                  onClick={() =>
                    addManual(
                      { type: 'project', id: project.id },
                      { start, ...(project.period?.end ? { end: project.period.end } : {}) },
                    )
                  }
                >
                  <IconPlus />
                  {t('evidence.addManual')}
                </button>
              ) : (
                // A record needs a period, and inventing one is the one thing
                // this app does not do — so the dates come first.
                <p className="evidence-lede">{t('evidence.project.undated')}</p>
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
          <section className="role-section">
            <hr className="rule" />
            <p className="eyebrow evidence-eyebrow">{t('evidence.orphans.title')}</p>
            <p className="evidence-nudge">{t('evidence.orphans.lede')}</p>
            <div className="rec-grid rec-grid-gap">{orphans.map(record)}</div>
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
