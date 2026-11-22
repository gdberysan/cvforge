'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { Chip } from '@/components/ui/Chip'
import { Sheet } from '@/components/ui/Sheet'
import { plural, type Translate } from '@/lib/i18n'
import { type GroupTone, groupByTone, toneOf, toneWord } from '@/lib/requirement-tone'
import type { RequirementKind } from '@/lib/schemas'

export type ChipRequirement = {
  id: string
  keyword: string
  kind: RequirementKind
  mandatory: boolean
  strength: 'strong' | 'partial' | 'none'
  unjudged: boolean
  /** A location, timezone or authorization requirement that gates the verdict. */
  blocker?: boolean
  rationale: string
  /** What the posting asked, verbatim. */
  text: string
  /** text null: the mapping cites a record that has since been deleted. */
  sources: { id: string; text: string | null; label: string }[]
}

/** Past this many a group stops growing the page; the rest open in place. */
const CAP = 24

// The rule and the grouping live in lib/requirement-tone, shared with the
// agent find's preview on Hoy; re-exported for the existing callers.
export { groupByTone }

/**
 * Requirements as facts you scan, not paragraphs you read. Everything the old
 * list printed — kind, required or preferred, strength, rationale — and the
 * evidence behind it is one tap away in a sheet: the never-invents promise as
 * something you can check, not something you are told.
 */
export function RequirementChips({ items }: { items: ChipRequirement[] }) {
  const t = useT()
  const [openId, setOpenId] = useState<string | null>(null)
  const open = items.find((r) => r.id === openId) ?? null
  const groups = [
    {
      key: 'mandatory',
      title: t('requirements.mandatory'),
      rows: items.filter((r) => r.mandatory),
    },
    {
      key: 'preferred',
      title: t('requirements.preferred'),
      rows: items.filter((r) => !r.mandatory),
    },
  ].filter((g) => g.rows.length > 0)

  return (
    <section className="req-chips" aria-labelledby="req-title">
      <h2 id="req-title" className="eyebrow">
        {t('application.requirements')}
      </h2>
      <p className="req-hint">{t('requirements.tapHint')}</p>
      {groups.map((g) => (
        <Group key={g.key} t={t} title={g.title} rows={g.rows} onPick={setOpenId} />
      ))}
      <Sheet open={open !== null} onClose={() => setOpenId(null)} title={open?.keyword ?? ''}>
        {open && (
          <>
            <p className="tag-row">
              <span className="tag">{t(`kind.${open.kind}`)}</span>
              <span className="tag">
                {t(open.mandatory ? 'application.required' : 'application.preferred')}
              </span>
              <span className={`tag tone-${toneOf(open)}`}>{toneWord(t, open)}</span>
            </p>
            <blockquote className="req-asked">{open.text}</blockquote>
            {(open.unjudged || open.rationale) && (
              <p className="sheet-text">
                {open.unjudged ? t('verdict.unjudgedOne') : open.rationale}
              </p>
            )}
            <h3 className="eyebrow">{t('requirements.sources')}</h3>
            {open.sources.length === 0 ? (
              <p className="sheet-muted">{t('verdict.noEvidence')}</p>
            ) : (
              <ul className="source-list">
                {open.sources.map((s) =>
                  s.text === null ? (
                    <li key={s.id} className="sheet-muted">
                      {t('requirements.sourceGone')}
                    </li>
                  ) : (
                    <li key={s.id}>
                      <blockquote className="source-quote">{s.text}</blockquote>
                      {s.label && <span className="source-label">{s.label}</span>}
                    </li>
                  ),
                )}
              </ul>
            )}
          </>
        )}
      </Sheet>
    </section>
  )
}

function Group({
  t,
  title,
  rows,
  onPick,
}: {
  t: Translate
  title: string
  rows: ChipRequirement[]
  onPick: (id: string) => void
}) {
  return (
    <div className="req-group">
      <h3 className="req-group-title">
        {title} <span className="num">{rows.length}</span>
      </h3>
      {groupByTone(rows).map((g) => (
        <ToneGroup key={g.tone} t={t} tone={g.tone} rows={g.rows} onPick={onPick} />
      ))}
    </div>
  )
}

function ToneGroup({
  t,
  tone,
  rows,
  onPick,
}: {
  t: Translate
  tone: GroupTone
  rows: ChipRequirement[]
  onPick: (id: string) => void
}) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, CAP)
  return (
    <div className={`req-tone tone-${tone}`}>
      <h4 className="req-tone-label">
        <span className="req-swatch" aria-hidden="true" />
        <span>
          {t(`requirements.group.${tone}`)} · <span className="num">{rows.length}</span>
        </span>
      </h4>
      <ul className="chips">
        {shown.map((r) => (
          <li key={r.id}>
            <Chip tone={toneOf(r)} toneLabel={toneWord(t, r)} onClick={() => onPick(r.id)}>
              {r.keyword}
            </Chip>
          </li>
        ))}
        {!all && rows.length > CAP && (
          <li>
            <Chip tone="neutral" onClick={() => setAll(true)}>
              {plural(t, rows.length - CAP, 'requirements.more')}
            </Chip>
          </li>
        )}
      </ul>
    </div>
  )
}
