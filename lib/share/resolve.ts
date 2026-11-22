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
  if (jobId) return { kind: 'linkedin', jobId, url: `https://www.linkedin.com/jobs/view/${jobId}/` }

  const text = params.text?.trim() ?? ''
  if (text.length >= MIN_POSTING) return { kind: 'text', text, ...(url ? { url } : {}) }
  return url ? { kind: 'paste', url } : { kind: 'paste' }
}
