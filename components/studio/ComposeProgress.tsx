'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { BuildSheet, phaseOf } from '@/components/ui/BuildSheet'
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
    <div className="work compose-progress">
      <BuildSheet kind="cv" phase={phaseOf(stage)} />
      <div className="work-body">
        <ol className="work-steps" aria-live="polite">
          {steps.map((s) => {
            const state = s === stage ? 'now' : seen.includes(s) ? 'done' : 'next'
            return (
              <li key={s} className={`is-${state}`}>
                <span className="work-mark" aria-hidden />
                <span>{t(`studio.stage.${s}`)}</span>
              </li>
            )
          })}
        </ol>
        <p className="work-note">{t('studio.elapsed', { n: seconds })}</p>
      </div>
    </div>
  )
}
