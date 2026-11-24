/**
 * The browser inside LinkedIn, Instagram or Facebook. Rumbo's launch arrives
 * as a LinkedIn post, so most first visits open here, and these browsers
 * differ from a real one in ways that break a job-search tool quietly:
 * they keep their own storage (a CV read here is not in Chrome tomorrow,
 * and the app may clear it), and they ignore downloads and the print
 * dialog, so "Download PDF" would do nothing at all.
 */
const IN_APP: [RegExp, string][] = [
  [/LinkedInApp/i, 'LinkedIn'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
]

/** The app whose own browser this is, or null in a real browser. */
export function inAppBrowser(userAgent: string): string | null {
  return IN_APP.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
}

export function platformOf(userAgent: string): 'android' | 'ios' | 'other' {
  if (/Android/i.test(userAgent)) return 'android'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  return 'other'
}

/**
 * A link that asks the phone to open this page in its real browser: an
 * Android intent for the default browser (falling back to the page itself),
 * or Safari's own scheme on iPhone. Null where there is no such way; the
 * person then uses the app's menu, which the screen explains.
 */
export function outsideUrl(href: string, userAgent: string): string | null {
  const url = new URL(href)
  if (url.protocol !== 'https:') return null
  const platform = platformOf(userAgent)
  if (platform === 'android')
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(href)};end`
  if (platform === 'ios') return `x-safari-${href}`
  return null
}

/**
 * Event sent after a download on Android. Inside LinkedIn's tab (Chrome, so
 * nothing in the user agent says so) a file the page made never saves; the
 * screen then says the way out, which keeps the person's data: Chrome's
 * own tab shares it.
 */
export const ANDROID_DOWNLOAD = 'rumbo:android-download'

/** Event the download helpers send instead of a download that cannot happen here. */
export const IN_APP_BLOCKED = 'rumbo:in-app-blocked'

/** True (and the event sent) when this browser cannot save files. */
export function blockedInApp(): boolean {
  if (typeof navigator === 'undefined' || !inAppBrowser(navigator.userAgent)) return false
  window.dispatchEvent(new Event(IN_APP_BLOCKED))
  return true
}
