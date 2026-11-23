import type { JobDetail } from '@/lib/schemas/discover'

/**
 * A LinkedIn job as the text triage reads. No description means nothing to
 * analyse — the caller shows the paste box rather than a verdict on a title.
 */
export function postingFromDetail(detail: JobDetail): string {
  const description = detail.description?.trim()
  if (!description) return ''
  const meta = [detail.company, detail.location].filter(Boolean).join(' · ')
  return `${[detail.title, meta].filter(Boolean).join('\n')}\n\n${description}`
}
