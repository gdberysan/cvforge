'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'

/**
 * Tags at rest are chips and nothing else. The draft field only exists once
 * you ask for it, because an always-present empty box on every record reads as
 * an unfinished form — and a page of unfinished forms is a page you avoid.
 *
 * Clicking a tag's text EDITS it in place; only the small × removes it. The
 * first version deleted on any click, which cost a user real tags — a
 * destructive action must never be the whole surface of a thing.
 */
export function TagRow({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const t = useT()
  const [draft, setDraft] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ tag: string; value: string } | null>(null)

  function commit(value: string, keepOpen: boolean) {
    const tag = value.trim().toLowerCase()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setDraft(keepOpen ? '' : null)
  }

  function commitEdit() {
    if (!editing) return
    const next = editing.value.trim().toLowerCase()
    // An emptied tag is a cancel, not a delete — deleting has its own button.
    // Renaming onto an existing tag merges into it: the Set keeps one copy,
    // where a duplicate meant duplicate React keys and one × removing both.
    if (next && next !== editing.tag) {
      onChange([...new Set(tags.map((each) => (each === editing.tag ? next : each)))])
    }
    setEditing(null)
  }

  const bare = {
    background: 'none',
    border: 'none',
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    padding: 0,
  } as const

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
      {tags.map((tag) =>
        editing?.tag === tag ? (
          <input
            key={tag}
            value={editing.value}
            // biome-ignore lint/a11y/noAutofocus: the field replaces the chip that was just clicked
            autoFocus
            onChange={(e) => setEditing({ tag, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitEdit()
              }
              if (e.key === 'Escape') setEditing(null)
            }}
            onBlur={commitEdit}
            aria-label={t('tag.editAria', { tag })}
            className="field-line fact"
            style={{
              width: `${Math.max(editing.value.length + 2, 8)}ch`,
              color: 'var(--text-body)',
            }}
          />
        ) : (
          <span
            key={tag}
            className="chip"
            style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}
          >
            <button
              type="button"
              onClick={() => setEditing({ tag, value: tag })}
              title={t('tag.editAria', { tag })}
              style={bare}
            >
              {tag}
            </button>
            <button
              type="button"
              onClick={() => onChange(tags.filter((each) => each !== tag))}
              aria-label={t('tag.remove', { tag })}
              title={t('tag.remove', { tag })}
              style={{ ...bare, color: 'var(--text-muted)', padding: '0 2px' }}
            >
              ×
            </button>
          </span>
        ),
      )}

      {draft === null ? (
        <button type="button" className="action-quiet" onClick={() => setDraft('')}>
          {t('tag.add')}
        </button>
      ) : (
        <input
          value={draft}
          // biome-ignore lint/a11y/noAutofocus: the field exists only because it was just asked for
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit(draft, true)
            }
            if (e.key === 'Escape') setDraft(null)
          }}
          onBlur={() => commit(draft, false)}
          placeholder={t('tag.placeholder')}
          aria-label={t('tag.aria')}
          className="field-line fact"
          style={{ width: '10ch', color: 'var(--text-body)' }}
        />
      )}
    </div>
  )
}
