import Link from 'next/link'
import { STEPS, type Step, type StepState } from '@/lib/application-steps'
import type { Translate } from '@/lib/i18n'

/**
 * The five steps of one application, always visible, each a link — so
 * back/forward and a shared URL land on the same step. The marker says what
 * the code knows: done, a count still open, or nothing yet.
 */
export function StepNav({
  applicationId,
  active,
  current,
  states,
  t,
}: {
  applicationId: string
  active: Step
  /** Where the application actually is; marked so a detour is obvious. */
  current: Step
  states: Record<Step, StepState>
  t: Translate
}) {
  return (
    <nav aria-label={t('steps.aria')} className="stepnav">
      <ol>
        {STEPS.map((step, i) => {
          const state = states[step]
          const isActive = step === active
          return (
            <li key={step}>
              <Link
                href={`/application/${applicationId}?step=${step}`}
                aria-current={isActive ? 'step' : undefined}
                className={`stepnav-item${isActive ? ' is-active' : ''}${state.done ? ' is-done' : ''}`}
              >
                <span className="stepnav-num" aria-hidden>
                  {state.done ? '✓' : i + 1}
                </span>
                <span className="stepnav-label">{t(`steps.${step}`)}</span>
                {step === current && !isActive && (
                  <span className="stepnav-here">{t('steps.here')}</span>
                )}
                {!state.done && state.count !== undefined && state.count > 0 && (
                  <span className="stepnav-count">
                    <span aria-hidden>{state.count}</span>
                    <span className="sr-only">{t('steps.openCount', { n: state.count })}</span>
                  </span>
                )}
                {state.done && <span className="sr-only">{t('steps.done')}</span>}
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
