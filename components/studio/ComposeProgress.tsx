'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import type { ComposeStage } from '@/lib/ai/compose'

const ORDER: ComposeStage[] = [
  'writing',
  'checking',
  'repairing',
  'verifying',
  'refining',
  'rechecking',
]
/** Steps that appear only when the run actually took them. */
const OPTIONAL: ComposeStage[] = ['repairing', 'refining', 'rechecking']

/**
 * The stages the server actually reported, in order, with the time spent.
 * The repair steps appear only if they happened — the list never promises a step
 * the run did not take.
 */
export function ComposeProgress({
  stage,
  seen,
}: {
  stage: ComposeStage | null
  seen: ComposeStage[]
}) {
  const t = useT()
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const steps = ORDER.filter((s) => !OPTIONAL.includes(s) || seen.includes(s))
  return (
    <div className="compose-progress">
      <ol aria-live="polite">
        {steps.map((s) => {
          const state = s === stage ? 'now' : seen.includes(s) ? 'done' : 'todo'
          return (
            <li key={s} className={`is-${state}`}>
              <span aria-hidden className="mark">
                {state === 'done' ? '✓' : state === 'now' ? '●' : '○'}
              </span>
              {t(`studio.stage.${s}`)}
            </li>
          )
        })}
      </ol>
      <p className="fact" style={{ marginTop: 'var(--space-3)' }}>
        {t('studio.elapsed', { n: seconds })}
      </p>
    </div>
  )
}
