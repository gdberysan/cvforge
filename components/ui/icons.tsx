import type { ReactNode } from 'react'
import { BRAND } from '@/lib/brand'

/**
 * CVForge's icons, drawn here rather than pulled from a library: one 24px
 * grid, one 1.75 stroke, round joins, currentColor — so an icon always takes
 * the colour of the word beside it, in both themes. Decorative by default:
 * the word next to it is the name, so the icon is hidden from screen readers.
 */
function Icon({
  children,
  size = 22,
  className = 'icon',
}: {
  children: ReactNode
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Today: a sun clearing the horizon. */
export const IconToday = () => (
  <Icon>
    <path d="M4 18h16" />
    <path d="M7.5 18a4.5 4.5 0 0 1 9 0" />
    <path d="M12 6.5V9" />
    <path d="m5.6 10.6 1.7 1.7" />
    <path d="m18.4 10.6-1.7 1.7" />
  </Icon>
)

/** Today: a house — where you start and come back to. */
export const IconHome = () => (
  <Icon>
    <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
  </Icon>
)

/** My experience: a person. */
export const IconPerson = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Icon>
)

/**
 * The wordmark's mark. CVForge: a check, what it gives back. Rumbo: a compass
 * needle pointing up and forward, its leading half warm.
 */
export const IconMark = () =>
  BRAND === 'Rumbo' ? (
    <svg viewBox="0 0 24 24" width={22} height={22} className="icon brand-needle" aria-hidden>
      <g transform="rotate(45 12 12)">
        <path className="brand-needle-fore" d="M12 2.5 L14.6 12 L9.4 12 Z" />
        <path className="brand-needle-back" d="M9.4 12 L14.6 12 L12 21.5 Z" />
      </g>
    </svg>
  ) : (
    <Icon size={16} className="icon brand-check">
      <path d="M5 12l4 4L19 6" />
    </Icon>
  )

/** Pipeline: applications moving through stages. */
export const IconPipeline = () => (
  <Icon>
    <rect x="3.5" y="4.5" width="5" height="15" rx="1.5" />
    <rect x="10" y="4.5" width="5" height="10" rx="1.5" />
    <rect x="16.5" y="4.5" width="4" height="6" rx="1.5" />
  </Icon>
)

/** Analyse: a posting under the lens. */
export const IconAnalyse = () => (
  <Icon>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5 5" />
    <path d="M8 10.5h5" />
    <path d="M8 8h3" />
  </Icon>
)

/** Settings: two sliders. */
export const IconSettings = () => (
  <Icon>
    <path d="M4 8h9" />
    <path d="M17 8h3" />
    <circle cx="15" cy="8" r="2" />
    <path d="M4 16h3" />
    <path d="M11 16h9" />
    <circle cx="9" cy="16" r="2" />
  </Icon>
)

/** A step forward: the end of a card's one action. */
export const IconChevron = ({ flip = false }: { flip?: boolean } = {}) => (
  <Icon size={16} className={flip ? 'icon icon-flip' : 'icon'}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
)

/** Close a sheet. */
export const IconClose = () => (
  <Icon size={18}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Icon>
)

/** More about this: the "what does this mean" door. */
export const IconInfo = () => (
  <Icon size={18}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <path d="M12 7.8v.2" />
  </Icon>
)

/** Edit: a pencil. */
export const IconEdit = () => (
  <Icon size={18}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
)

/** Done: a check. */
export const IconCheck = () => (
  <Icon size={18}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)

/** Add a number: a plus beside a hash. */
export const IconAddNumber = () => (
  <Icon size={16}>
    <path d="M6 4 5 14M11 4l-1 10M3 7.5h9M2.5 11h9" />
    <path d="M18 13v7M14.5 16.5h7" />
  </Icon>
)

/** Add: a plus. */
export const IconPlus = () => (
  <Icon size={18}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

/** Import: an arrow into a tray. */
export const IconImport = () => (
  <Icon size={18}>
    <path d="M12 4v10M8 10.5l4 4 4-4" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Icon>
)

/** Download: an arrow onto a line. */
export const IconDownload = () => (
  <Icon size={18}>
    <path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5" />
    <path d="M5 20h14" />
  </Icon>
)

/** Copy: two sheets. */
export const IconCopy = () => (
  <Icon size={18}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Icon>
)

/** Regenerate: a circular arrow. */
export const IconRegenerate = () => (
  <Icon size={18}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </Icon>
)

/** Evidence used: a stack of records. */
export const IconStack = () => (
  <Icon size={18}>
    <path d="m12 4 8 4-8 4-8-4z" />
    <path d="m4 12 8 4 8-4" />
    <path d="m4 16 8 4 8-4" />
  </Icon>
)

/** Show in the PDF: a page with lines. */
export const IconFind = () => (
  <Icon size={16}>
    <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
    <path d="M9 12h6M9 15.5h4" />
  </Icon>
)

/** Verified: a check in a circle. */
export const IconVerified = () => (
  <Icon size={18}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.3 2.4 2.4 4.6-5" />
  </Icon>
)

/** A document: a page with a folded corner — the CV and letter, written. */
export const IconDocument = () => (
  <Icon size={18}>
    <path d="M7 3.5h7l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
    <path d="M14 3.5V8h4.5" />
    <path d="M9 12.5h6M9 16h4" />
  </Icon>
)

/** Sent: a paper plane leaving. */
export const IconSend = () => (
  <Icon size={18}>
    <path d="m20.5 3.5-10.3 10.3" />
    <path d="M20.5 3.5 14 20.5l-3.8-6.7L3.5 10z" />
  </Icon>
)

/** Inbox: a tray waiting for the answer. */
export const IconInbox = () => (
  <Icon size={18}>
    <path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" />
    <path d="M6 6.1A1.5 1.5 0 0 1 7.4 5h9.2A1.5 1.5 0 0 1 18 6.1l2.5 7.4V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18v-4.5z" />
  </Icon>
)

/** They replied: an arrow turning back. */
export const IconReply = () => (
  <Icon size={18}>
    <path d="M9.5 7 4.5 12l5 5" />
    <path d="M4.5 12h9a6 6 0 0 1 6 6v.5" />
  </Icon>
)

/** A call: a handset. */
export const IconPhone = () => (
  <Icon size={18}>
    <path d="M8.6 4.5H6a1.5 1.5 0 0 0-1.5 1.6c.6 7.3 6.1 12.8 13.4 13.4a1.5 1.5 0 0 0 1.6-1.5v-2.6a1 1 0 0 0-.7-1l-3-1a1 1 0 0 0-1 .3l-1.4 1.4a11 11 0 0 1-4.6-4.6l1.4-1.4a1 1 0 0 0 .3-1l-1-3a1 1 0 0 0-1-.6z" />
  </Icon>
)

/** A no: a cross in a circle. */
export const IconXCircle = () => (
  <Icon size={18}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
  </Icon>
)

/** Silence: an hourglass that ran out. */
export const IconHourglass = () => (
  <Icon size={18}>
    <path d="M7 3.5h10M7 20.5h10" />
    <path d="M8 3.5v2.8a4 4 0 0 0 1.6 3.2L12 12l2.4-2.5A4 4 0 0 0 16 6.3V3.5" />
    <path d="M8 20.5v-2.8a4 4 0 0 1 1.6-3.2L12 12l2.4 2.5a4 4 0 0 1 1.6 3.2v2.8" />
  </Icon>
)

/** A date: a calendar page — an interview on the books. */
export const IconCalendar = () => (
  <Icon size={18}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M4 10h16" />
    <path d="M8.5 3.5v4M15.5 3.5v4" />
  </Icon>
)

/** The agent: a spark — something the job agent did on its own. */
export const IconAgent = () => (
  <Icon size={18}>
    <path d="M11 5.5c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6z" />
    <path d="M18 3.5v3.5M16.25 5.25h3.5" />
  </Icon>
)

/** Leaves the app: an arrow out of a box. */
export const IconExternal = () => (
  <Icon size={16}>
    <path d="M13.5 4.5h6v6" />
    <path d="m19.5 4.5-8.5 8.5" />
    <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </Icon>
)
