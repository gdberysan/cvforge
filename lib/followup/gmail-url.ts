/** Gmail's compose URL; longer than this and some browsers and Gmail cut it. */
const URL_LIMIT = 2000

/**
 * "Abrir en Gmail". Every parameter goes through encodeURIComponent, so an
 * accent, an emoji, `&`, `#` or `+` arrives as written. Over the limit, the
 * body stays out of the URL and the caller copies it to the clipboard first.
 */
export function gmailComposeUrl(d: { to: string; subject: string; body: string }): {
  url: string
  bodyInUrl: boolean
} {
  const head = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(d.to)}&su=${encodeURIComponent(d.subject)}`
  const full = `${head}&body=${encodeURIComponent(d.body)}`
  return full.length <= URL_LIMIT ? { url: full, bodyInUrl: true } : { url: head, bodyInUrl: false }
}
