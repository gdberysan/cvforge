'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { Switch } from '@/components/ui/Switch'
import { haptic, hapticsOn, setHapticsOn } from '@/lib/ui/haptics'
import { SettingsRow } from './SettingsGroup'

/**
 * Vibration on tap, for this device only (lib/ui/haptics). Offered only
 * where it can be felt: a touch screen whose browser can vibrate — a Mac
 * would show a switch that does nothing. Known after mount, so the server
 * render and the first client render agree on showing nothing.
 */
export function HapticsToggle() {
  const t = useT()
  const [offered, setOffered] = useState(false)
  const [on, setOn] = useState(true)

  useEffect(() => {
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
    setOffered(touch && typeof navigator.vibrate === 'function')
    setOn(hapticsOn())
  }, [])

  if (!offered) return null

  function toggle(next: boolean) {
    setOn(next)
    setHapticsOn(next)
    if (next) haptic('confirm')
  }

  return (
    <SettingsRow label={t('settings.haptics.toggle')} hint={t('settings.haptics.note')}>
      <Switch checked={on} onChange={toggle} label={t('settings.haptics.toggle')} />
    </SettingsRow>
  )
}
