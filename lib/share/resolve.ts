import { linkedInJobId } from '@/lib/discover/annotate'

/** What Android's share menu handed us, resolved to what we can do with it. */
export type Shared =
  | { kind: 'linkedin'; jobId: string; url: string }
  | { kind: 'text'; text: string; url?: string }
  | { kind: 'paste'; url?: string }

/** Same floor as the triage API: anything shorter is not a posting. */
const MIN_POSTING = 80

const HTTP_URL = /https?:\/\/[^\s<>"']+/i

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined
  } catch {
    return undefined
  }
}

/**
 * The LinkedIn app shares "Check out this job…: <link>" as text, browsers
 * share a url — so a job link is looked for in both. Selected text long
 * enough to be a posting is the posting. Everything else is the paste box,
 * with whatever link came along kept as the source.
 */
export function resolveShared(params: { title?: string; text?: string; url?: string }): Shared {
  const url = safeUrl(params.url) ?? safeUrl(params.text?.match(HTTP_URL)?.[0])
  const jobId = linkedInJobId(url ?? null)
  const canonical = jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : url
  const text = params.text?.trim() ?? ''
  // A posting that arrives with its text (the extension sends both) is that
  // posting. Only a bare link — LinkedIn's app shares one line and the
  // address — leaves the text for the person to bring.
  if (text.replace(HTTP_URL, '').trim().length >= MIN_POSTING) {
    return { kind: 'text', text, ...(canonical ? { url: canonical } : {}) }
  }
  if (jobId && canonical) return { kind: 'linkedin', jobId, url: canonical }
  return url ? { kind: 'paste', url } : { kind: 'paste' }
}
