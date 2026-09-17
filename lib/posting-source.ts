import type { Source } from '@/lib/schemas'

/**
 * Registrable domains, matched as whole labels — never as substrings.
 * `notlinkedin.com` and `linkedin.com.evil.example` must both miss: a
 * lookalike host scoring a hit would quietly record the wrong source on the
 * application.
 */
const BOARDS: { domain: string; source: Source }[] = [
  { domain: 'linkedin.com', source: 'linkedin' },
  { domain: 'occ.com.mx', source: 'occ' },
  { domain: 'computrabajo.com', source: 'computrabajo' },
  { domain: 'computrabajo.com.mx', source: 'computrabajo' },
  { domain: 'indeed.com', source: 'indeed' },
  { domain: 'indeed.com.mx', source: 'indeed' },
]

/**
 * Which job board a posting URL came from, so the source is not a second thing
 * to state by hand after pasting the link.
 *
 * An unrecognised host returns 'other', not 'company-site': a careers page and
 * a smaller job board look identical from the URL, and this product does not
 * guess about provenance it cannot check. The control stays editable either
 * way.
 */
export function sourceFromUrl(url: string): Source {
  const host = hostOf(url)
  if (!host) return 'other'

  for (const board of BOARDS) {
    // Whole-label suffix match: exactly the domain, or a subdomain of it.
    if (host === board.domain || host.endsWith(`.${board.domain}`)) return board.source
  }
  return 'other'
}

/**
 * The URL if it is safe to put in an href, otherwise null.
 *
 * The triage route validates this field with `z.string().url()`, which is
 * `new URL()` underneath and therefore says `javascript:alert(1)` is a
 * perfectly valid URL. Rendering that into a link would be stored XSS in a
 * field the user pasted themselves, so the scheme is checked again at the
 * point of use rather than trusted from storage.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null
  } catch {
    return null
  }
}

function hostOf(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    // A pasted link often arrives without a scheme; URL() requires one.
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    // Only http(s). Prepending a scheme above would otherwise turn a
    // `javascript:` paste into something this app treats as a link.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.hostname.toLowerCase()
  } catch {
    return null
  }
}
