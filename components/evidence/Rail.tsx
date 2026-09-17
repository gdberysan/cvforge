import Link from 'next/link'
import { Meter } from '@/components/ui/Meter'
import type { MessageKey, Translate } from '@/lib/i18n'
import type { ProfileStrength, Suggestion } from '@/lib/strength'

/**
 * The evidence page's left rail: the strength score, an index of roles with
 * their health at a glance, and the specific fixes that would raise the
 * score. Navigation plus diagnosis — the records themselves stay in the work
 * column.
 */

export type RoleIndexItem = {
  id: string
  title: string
  company: string
  recordCount: number
  quantified: number
  /** Empty or import-stubs only: the role cannot yet carry a CV. */
  needsExpanding: boolean
}

// Amber is the brand's one accent — the positive focal state, never a
// warning tier (§10.3). Mid-severity is steel; low is quiet but still there.
const SEVERITY_COLOR = {
  high: 'var(--signal-error)',
  medium: 'var(--graphite-200)',
  low: 'var(--text-faint)',
} as const

/** The scorer names the reason; the dictionary supplies the sentence. */
function say(t: Translate, s: Suggestion): string {
  const base = `strength.${s.id}`
  if (!s.countable) return t(base as MessageKey, s.params)
  const n = Number(s.params?.n ?? 0)
  return t(`${base}.${n === 1 ? 'one' : 'other'}` as MessageKey, s.params)
}

/** Health at a glance: red = cannot carry a CV, green = mostly quantified. */
function dotColor(r: RoleIndexItem): string {
  if (r.needsExpanding) return 'var(--signal-error)'
  return r.quantified / r.recordCount >= 0.5 ? 'var(--signal-ok)' : 'var(--accent)'
}

const card = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
} as const

export function Rail({
  strength,
  roles,
  t,
}: {
  strength: ProfileStrength
  roles: RoleIndexItem[]
  t: Translate
}) {
  return (
    <aside className="rail" style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div
        className="panel"
        style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}
      >
        <p className="eyebrow">{t('strength.eyebrow')}</p>
        <p style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', margin: 0 }}>
          <span className="datum" style={{ fontSize: 39, lineHeight: 1, fontWeight: 500 }}>
            {strength.score}
          </span>
          <span className="fact" style={{ color: 'var(--text-faint)' }}>
            /100
          </span>
        </p>
        <Meter pct={strength.score} color="var(--accent)" />

        {/* The breakdown, not just the total: seven fixed rows so "what's
            missing" reads as a checklist with a point value attached, not a
            number you have to trust. */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
          {strength.categories.map((c) => (
            <li
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                font: 'var(--type-body-sm)',
                color: c.earned ? 'var(--text-muted)' : 'var(--text-body)',
              }}
            >
              <span>
                <span
                  aria-hidden
                  style={{ color: c.earned ? 'var(--signal-ok)' : 'var(--text-faint)' }}
                >
                  {c.earned ? '✓' : '·'}
                </span>{' '}
                {t(`strength.category.${c.id}` as MessageKey)}
              </span>
              <span className="fact" style={{ color: 'var(--text-faint)' }}>
                {c.earned ? c.points : `+${c.points}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <nav aria-label={t('evidence.rail.roles')} style={{ ...card, padding: 'var(--space-3) 0' }}>
        <p className="eyebrow" style={{ padding: '0 var(--space-4) var(--space-2)' }}>
          {t('evidence.rail.roles')}
        </p>
        {roles.map((r) => (
          <Link
            key={r.id}
            href={`#role-${r.id}`}
            className="railitem"
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto',
              gap: 'var(--space-3)',
              alignItems: 'baseline',
              padding: 'var(--space-2) var(--space-3)',
              color: 'inherit',
            }}
          >
            <span aria-hidden className="ident" style={{ color: dotColor(r) }}>
              ●
            </span>
            <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
              {/* The dot is color-only; the ratio it encodes, spoken. */}
              <span className="sr-only">{t('evidence.quantified', { n: r.quantified })} </span>
              <span
                style={{
                  font: 'var(--type-body-sm)',
                  color: 'var(--text-strong)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.title}
              </span>
              <span className="fact" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {r.company}
              </span>
            </span>
            <span
              className="fact"
              style={{
                fontSize: 12,
                color: r.recordCount === 0 ? 'var(--signal-error)' : 'var(--text-faint)',
              }}
            >
              {r.recordCount === 0 ? t('evidence.rail.empty') : r.recordCount}
            </span>
          </Link>
        ))}
      </nav>

      <div style={{ ...card, padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-3)' }}>
        <p className="eyebrow">{t('evidence.rail.missing')}</p>
        {strength.suggestions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', font: 'var(--type-body-sm)', margin: 0 }}>
            {t('strength.nothing')}
          </p>
        ) : (
          strength.suggestions.map((s, i) => (
            <p
              key={`${s.id}-${s.targetId ?? i}`}
              style={{
                borderLeft: `2px solid ${SEVERITY_COLOR[s.severity]}`,
                paddingLeft: 'var(--space-3)',
                font: 'var(--type-body-sm)',
                color: 'var(--text-body)',
                margin: 0,
              }}
            >
              {say(t, s)}
              {s.targetId && (
                <>
                  {' '}
                  <Link href={`/evidence/interview/${s.targetId}`} className="action">
                    {t('evidence.expand')}
                  </Link>
                </>
              )}
            </p>
          ))
        )}
      </div>
    </aside>
  )
}
