'use client'

import { useState, useTransition } from 'react'
import { setUpdateCheckAction } from '@/app/(app)/settings/actions'
import { useT } from '@/components/i18n/LocaleProvider'
import { Switch } from '@/components/ui/Switch'
import { SettingsRow } from './SettingsGroup'

/** Opt-in, default off, and the note says exactly what gets fetched. */
export function UpdateToggle({ enabled }: { enabled: boolean }) {
  const t = useT()
  const [on, setOn] = useState(enabled)
  const [, startTransition] = useTransition()

  function toggle(next: boolean) {
    setOn(next)
    startTransition(async () => {
      const result = await setUpdateCheckAction(next)
      if (!result.ok) setOn(!next)
    })
  }

  return (
    <SettingsRow label={t('settings.updates.toggle')} hint={t('settings.updates.note')}>
      <Switch checked={on} onChange={toggle} label={t('settings.updates.toggle')} />
    </SettingsRow>
  )
}
