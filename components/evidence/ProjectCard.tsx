'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  addProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from '@/app/(app)/evidence/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { errorText, plural } from '@/lib/i18n'
import type { Project } from '@/lib/schemas'

const PERIOD = /^\d{4}-\d{2}$/

type Draft = {
  name: string
  description: string
  url: string
  stack: string
  start: string
  end: string
}

function draftOf(project?: Project): Draft {
  return {
    name: project?.name ?? '',
    description: project?.description ?? '',
    url: project?.url ?? '',
    stack: project?.stack.join(', ') ?? '',
    start: project?.period?.start ?? '',
    end: project?.period?.end ?? '',
  }
}

function payloadOf(d: Draft) {
  return {
    name: d.name,
    description: d.description,
    ...(d.url.trim() ? { url: d.url.trim() } : {}),
    stack: d.stack
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    start: d.start,
    ...(d.end ? { end: d.end } : {}),
  }
}

/**
 * The shared fields for adding and editing. A start month is required here
 * even though an imported project may lack one: a record you add needs a
 * period, and the only honest source for it is you.
 */
function ProjectFields({
  idPrefix,
  draft,
  set,
}: {
  idPrefix: string
  draft: Draft
  set: (d: Draft) => void
}) {
  const t = useT()
  const field = (key: keyof Draft, label: string, placeholder?: string) => (
    <div>
      <label htmlFor={`${idPrefix}-${key}`} className="fact-label" style={{ display: 'block' }}>
        {label}
      </label>
      <input
        id={`${idPrefix}-${key}`}
        value={draft[key]}
        onChange={(e) => set({ ...draft, [key]: e.target.value })}
        placeholder={placeholder}
        className="field"
        style={{ marginTop: 'var(--space-2)' }}
      />
    </div>
  )
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {field('name', t('addProject.name'), t('addProject.namePlaceholder'))}
      {field('description', t('addProject.description'))}
      {field('stack', t('addProject.stack'), t('addProject.stackPlaceholder'))}
      {field('url', t('addProject.url'))}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        {field('start', t('addRole.start'), '2024-01')}
        {field('end', t('addRole.end'), t('addRole.endPlaceholder'))}
      </div>
    </div>
  )
}

function valid(d: Draft): boolean {
  return d.name.trim().length > 0 && PERIOD.test(d.start) && (d.end === '' || PERIOD.test(d.end))
}

/** A project's stated facts, editable in place — the counterpart of RoleHeader. */
export function ProjectHeader({
  project,
  recordCount,
  quantified,
}: {
  project: Project
  recordCount: number
  quantified: number
}) {
  const t = useT()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(draftOf(project))
  const [armedDelete, setArmedDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  if (!editing) {
    return (
      <>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 'var(--space-5)',
            flexWrap: 'wrap',
            marginTop: 'var(--space-4)',
          }}
        >
          <h2 style={{ font: 'var(--type-h4)', color: 'var(--text-strong)' }}>
            {project.name}
            {project.stack.length > 0 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                {' · '}
                {project.stack.join(', ')}
              </span>
            )}
          </h2>
          <button
            type="button"
            className="action-quiet"
            onClick={() => {
              setDraft(draftOf(project))
              setArmedDelete(false)
              setError(null)
              setEditing(true)
            }}
          >
            {t('role.edit')}
          </button>
        </div>
        {project.description && (
          <p style={{ marginTop: 'var(--space-2)', color: 'var(--text-body)', maxWidth: '38em' }}>
            {project.description}
          </p>
        )}
        <p className="fact" style={{ marginTop: 'var(--space-2)' }}>
          {project.period?.start
            ? `${project.period.start} → ${project.period.end ?? t('evidence.present')}`
            : t('evidence.undated')}
          <span style={{ color: 'var(--text-muted)' }}>
            {'  ·  '}
            {plural(t, recordCount, 'evidence.records')}
            {'  ·  '}
            {t('evidence.quantified', { n: quantified })}
          </span>
        </p>
      </>
    )
  }

  return (
    <div style={{ marginTop: 'var(--space-4)', maxWidth: '34em' }}>
      <ProjectFields idPrefix={project.id} draft={draft} set={setDraft} />
      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-4)' }}>
          {error}
        </p>
      )}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-5)',
          alignItems: 'baseline',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid(draft) || isSaving}
          onClick={() =>
            startSave(async () => {
              const result = await updateProjectAction(project.id, payloadOf(draft))
              if (!result.ok) {
                setError(errorText(t, result.code, result.error))
                return
              }
              setEditing(false)
              router.refresh()
            })
          }
        >
          {isSaving ? t('role.saving') : t('project.save')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
          {t('addRole.cancel')}
        </button>
        <button
          type="button"
          className="action-quiet"
          disabled={isSaving}
          style={armedDelete ? { color: 'var(--signal-error)' } : undefined}
          onClick={() => {
            if (!armedDelete) {
              setArmedDelete(true)
              return
            }
            startSave(async () => {
              const result = await deleteProjectAction(project.id)
              if (!result.ok) {
                setError(errorText(t, result.code, result.error))
                return
              }
              router.refresh()
            })
          }}
        >
          {armedDelete ? plural(t, recordCount, 'project.deleteConfirm') : t('project.delete')}
        </button>
      </div>
    </div>
  )
}

/** The door for self-built work, so it never has to borrow an employer. */
export function AddProject() {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(draftOf())
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  if (!open) {
    return (
      <p style={{ marginTop: 'var(--space-4)' }}>
        <button type="button" className="action" onClick={() => setOpen(true)}>
          {t('evidence.addProject')}
        </button>
      </p>
    )
  }

  return (
    <section style={{ marginTop: 'var(--space-6)', maxWidth: '34em' }}>
      <p className="eyebrow">{t('addProject.eyebrow')}</p>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <ProjectFields idPrefix="new-project" draft={draft} set={setDraft} />
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--signal-error)', marginTop: 'var(--space-4)' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid(draft) || isSaving}
          onClick={() =>
            startSave(async () => {
              const result = await addProjectAction(payloadOf(draft))
              if (!result.ok) {
                setError(errorText(t, result.code, result.error))
                return
              }
              setOpen(false)
              setDraft(draftOf())
              router.refresh()
            })
          }
        >
          {isSaving ? t('addRole.saving') : t('addProject.submit')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
          {t('addRole.cancel')}
        </button>
      </div>
    </section>
  )
}
