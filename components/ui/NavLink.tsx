'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Marks the current section, so you can tell where you are. */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="nav-link fact"
      style={{
        letterSpacing: '0.06em',
        color: active ? 'var(--text-strong)' : 'var(--text-muted)',
        borderBottom: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
      }}
    >
      {label}
    </Link>
  )
}
