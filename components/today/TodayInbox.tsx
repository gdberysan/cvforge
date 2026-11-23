import Link from 'next/link'
import {
  IconCalendar,
  IconChevron,
  IconDocument,
  IconHourglass,
  IconSend,
} from '@/components/ui/icons'
import { Meta } from '@/components/ui/Meta'
import type { AttentionReason } from '@/lib/stats'

const REASON_ICON = {
  decide: IconDocument,
  unsent: IconSend,
  interviewing: IconCalendar,
  stale: IconHourglass,
} as const

export type InboxItem = {
  id: string
  title: string
  company: string
  why: string
  href: string
  action: string
  reason: AttentionReason
  /** How long it has waited, shown as the row's tile instead of an icon. */
  age?: number
}

/** Three weeks of silence: the tile turns amber. */
const LONG_WAIT = 21

/**
 * What needs you, one card each and one move each. The whole card is the
 * link, so the target is the card, and the move is named for what it gets
 * done (Decidir, Preparar, Dar seguimiento) rather than for where it goes.
 */
export function TodayInbox({ items, lead }: { items: InboxItem[]; lead?: string }) {
  return (
    <ul className="inbox">
      {items.map((i, n) => (
        // The first card is the one move for today: it leads, in ink.
        <li
          key={i.id}
          className={`inbox-card reason-${i.reason}${n === 0 && lead ? ' is-lead' : ''}`}
        >
          <Link href={i.href} className="inbox-link">
            {n === 0 && lead && <span className="inbox-lead">{lead}</span>}
            {i.age !== undefined ? (
              <span className={`inbox-age${i.age >= LONG_WAIT ? ' is-long' : ''}`}>{i.age}</span>
            ) : (
              <InboxIcon reason={i.reason} />
            )}
            <span className="inbox-title">{i.title}</span>
            <span className="inbox-why">
              <Meta>
                {i.company}
                {i.why}
              </Meta>
            </span>
            <span className="inbox-action">
              {i.action}
              <IconChevron />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function InboxIcon({ reason }: { reason: AttentionReason }) {
  const Icon = REASON_ICON[reason]
  return (
    <span className="inbox-icon" aria-hidden>
      <Icon />
    </span>
  )
}
