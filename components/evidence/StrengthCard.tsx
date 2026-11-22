import Link from 'next/link'
import { IconCheck } from '@/components/ui/icons'
import { ScoreChange } from '@/components/ui/ScoreChange'
import type { MessageKey, Translate } from '@/lib/i18n'
import type { ProfileStrength, Suggestion } from '@/lib/strength'
import { EditDetailsButton, ShowEvidenceButton } from './ShowEvidenceButton'
import { StrengthRing } from './StrengthRing'

/** Which evidence filter shows the entries a suggestion is about. */
const FIX_FILTER: Partial<Record<Suggestion['id'], string>> = {
  'metrics-missing': 'unquantified',
  'tags-missing': 'untagged',
}

/** Which part of the profile card's form a suggestion is fixed in. */
const FIX_DETAILS: Partial<Record<Suggestion['id'], string>> = {
  'summary-empty': 'summary',
  'skills-empty': 'skills',
  'target-titles-empty': 'titles',
}

/** The scorer names the reason; the dictionary supplies the sentence. */
export function say(t: Translate, s: Suggestion): string {
  const base = `strength.${s.id}`
  if (!s.countable) return t(base as MessageKey, s.params)
  const n = Number(s.params?.n ?? 0)
  return t(`${base}.${n === 1 ? 'one' : 'other'}` as MessageKey, s.params)
}

/**
 * Mi experiencia's one card above the work: the score, the single fix worth
 * the most, and the button that does it. How the score is made — seven
 * slices with their points — and the rest of what is missing sit folded
 * under it: there for whoever asks, never text everyone has to read.
 */
export function StrengthCard({ strength, t }: { strength: ProfileStrength; t: Translate }) {
  const top = strength.suggestions[0]
  const rest = strength.suggestions.slice(1)
  return (
    <section className="panel strength-card" data-testid="strength-card">
      <div className="strength-card-score">
        <StrengthRing score={strength.score} />
        <p className="strength-card-number">
          <span className="num strength-card-value">
            <ScoreChange value={strength.score} />
          </span>
          <span className="strength-card-of">/100</span>
        </p>
      </div>
      <div className="strength-card-body">
        <p className="eyebrow">{t('strength.eyebrow')}</p>
        <p className="strength-card-fix">{top ? say(t, top) : t('strength.nothing')}</p>
      </div>
      {top?.targetId ? (
        <Link href={`/evidence/interview/${top.targetId}`} className="btn btn-primary strength-act">
          {t('evidence.expandBtn')}
        </Link>
      ) : top && FIX_FILTER[top.id] ? (
        <ShowEvidenceButton filter={FIX_FILTER[top.id] as string} label={t('strength.showThem')} />
      ) : top && FIX_DETAILS[top.id] ? (
        <EditDetailsButton part={FIX_DETAILS[top.id] as string} label={t('strength.fixProfile')} />
      ) : null}

      <details className="strength-how">
        <summary>{t('strength.how')}</summary>
        <ul className="strength-breakdown">
          {/* What is still missing first: the one row you can act on is not
              fourth of seven among green checks. */}
          {[...strength.categories]
            .sort((a, b) => Number(a.earned) - Number(b.earned))
            .map((c) => (
              <li key={c.id} className={c.earned ? 'is-earned' : undefined}>
                <span className="icon-label">
                  {c.earned ? <IconCheck /> : <span className="strength-pending" aria-hidden />}
                  {t(`strength.category.${c.id}` as MessageKey)}
                </span>
                <span className="num">
                  {c.earned ? c.points : c.got > 0 ? `${c.got}/${c.points}` : `+${c.points}`}
                </span>
              </li>
            ))}
        </ul>
        {rest.length > 0 && (
          <div className="strength-rest">
            <p className="strength-rest-title">{t('evidence.rail.missing')}</p>
            {rest.map((s, i) => (
              <p key={`${s.id}-${s.targetId ?? i}`} className={`rail-fix sev-${s.severity}`}>
                {say(t, s)}
                {s.targetId && (
                  <>
                    {' '}
                    <Link
                      href={`/evidence/interview/${s.targetId}`}
                      className="action action-inline"
                    >
                      {t('evidence.expand')}
                    </Link>
                  </>
                )}
                {FIX_DETAILS[s.id] && (
                  <>
                    {' '}
                    <EditDetailsButton
                      part={FIX_DETAILS[s.id] as string}
                      label={t('strength.fixProfile')}
                      quiet
                    />
                  </>
                )}
              </p>
            ))}
          </div>
        )}
      </details>
    </section>
  )
}
