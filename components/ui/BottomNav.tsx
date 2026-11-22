'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@/components/i18n/LocaleProvider'
import { IconHome, IconPerson, IconSettings } from './icons'

/**
 * Three places (friendly redesign 2026-11-21): Today holds the box and the
 * applications; My experience holds what CVForge may say about you (and the
 * base CVs); Settings the rest. Each owns the routes that open from it.
 */
const ITEMS = [
  {
    href: '/',
    key: 'nav.today',
    Icon: IconHome,
    owns: ['/application', '/pipeline', '/share', '/triage', '/stats'],
  },
  { href: '/evidence', key: 'nav.evidence', Icon: IconPerson, owns: ['/cvs', '/interview'] },
  { href: '/settings', key: 'nav.settings', Icon: IconSettings, owns: [] },
] as const

function isHere(pathname: string, item: (typeof ITEMS)[number]): boolean {
  if (pathname === item.href) return true
  if (item.href !== '/' && pathname.startsWith(`${item.href}/`)) return true
  return item.owns.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * The phone's navigation: three destinations in thumb reach, on a floating
 * bar. Shown below 600px only (globals.css).
 */
export function BottomNav({ started }: { started: boolean }) {
  const t = useT()
  const pathname = usePathname()
  // Before a profile exists the three steps of the first run are the whole
  // app: a bar with one destination would only pull away from them.
  if (!started) return null
  return (
    <nav className="bottomnav" aria-label={t('nav.phone')}>
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isHere(pathname, i) ? 'page' : undefined}>
          <i.Icon />
          <span>{t(i.key)}</span>
        </Link>
      ))}
    </nav>
  )
}
