'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconArrow } from '@/components/ui/icons'
import { dataChanged, workerApi } from './actions-client'
import { useLoader } from './use-loader'

/**
 * The free trial's one button (web/trial): starts a trial pass, and the
 * first run moves on to the CV as if a key had been saved. What the trial
 * means for the person's data is said right under it, before they press.
 */
export function TrialCard() {
  const t = useT()
  const [state, setState] = useState<'idle' | 'busy' | 'closed' | 'limit' | 'failed'>('idle')
  // Once a trial is used up, this browser is past it: say so, offer no other.
  const settings = useLoader('settings')
  if (settings?.trialEnded) {
    return (
      <div className="welcome-card trial-card">
        <p className="trial-ended">{t('settings.trial.endedLede')}</p>
      </div>
    )
  }

  async function start() {
    setState('busy')
    const result = await (await workerApi()).startTrial()
    if (result === 'started') {
      dataChanged()
      return
    }
    setState(result)
  }

  return (
    <div className="welcome-card trial-card">
      <button type="button" className="btn btn-primary" onClick={start} disabled={state === 'busy'}>
        {state === 'busy' ? t('trial.starting') : t('trial.cta')}
        <IconArrow />
      </button>
      <p className="trial-note">{t('trial.note')}</p>
      {(state === 'closed' || state === 'limit' || state === 'failed') && (
        <p role="alert" className="form-error">
          {t(`trial.${state}`)}
        </p>
      )}
    </div>
  )
}
